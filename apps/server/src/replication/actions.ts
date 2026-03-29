import * as Piece from '@filoz/synapse-core/piece'
import * as SP from '@filoz/synapse-core/sp'
import {
  getPDPProvider,
  type PDPProvider,
} from '@filoz/synapse-core/sp-registry'
import {
  signAddPieces,
  signCreateDataSetAndAddPieces,
} from '@filoz/synapse-core/typed-data'
import {
  createPieceUrlPDP,
  datasetMetadataObjectToEntry,
  pieceMetadataObjectToEntry,
  randU256,
} from '@filoz/synapse-core/utils'
import {
  fetchProviderSelectionInput,
  getPdpDataSet,
  type PdpDataSet,
  selectProviders,
} from '@filoz/synapse-core/warm-storage'
import { and, eq, inArray, lte, sql } from 'drizzle-orm'
import { type Address, createWalletClient, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { Context } from '../../foxer.config.ts'
import type { PieceCopyStatus } from '../schema/piece-copies.ts'
import type { BasePullPiecesOptions } from '../types.ts'
import { MAX_BATCH_SIZE, MSP_METADATA } from '../utils/constants.ts'
import { findActiveKey } from '../utils/keys.ts'
import { nowInSecondsBigint } from '../utils/time.ts'

export type CopiesGroup = {
  payer: Address
  sourceProviderId: bigint
  copies: {
    id: bigint
    cid: string
  }[]
  privateKey: Hex
}
export async function groupCopies(context: Context) {
  const { db, schema } = context

  const lastBlockNumber = await context.publicClient.getBlockNumber()
  const finalizedBlockNumber = lastBlockNumber - context.finalityDepth
  const groups = await db
    .select({
      payer: schema.pieceCopies.payer,
      sourceProviderId: schema.pieceCopies.sourceProviderId,
      copies: sql<CopiesGroup['copies']>`json_agg(
        json_build_object(
          'id',
          ${schema.pieceCopies.id},
          'cid',
          ${schema.pieceCopies.cid}
        )
        order by ${schema.pieceCopies.id}
      )`,
    })
    .from(schema.pieceCopies)
    .where(
      and(
        lte(schema.pieceCopies.sourceBlockNumber, finalizedBlockNumber),
        eq(schema.pieceCopies.status, 'pending')
      )
    )
    .groupBy(schema.pieceCopies.payer, schema.pieceCopies.sourceProviderId)

  const filteredGroups: CopiesGroup[] = []

  for (const group of groups) {
    const key = await findActiveKey(db, group.payer)

    if (!key) {
      continue
    }

    const copyIds = group.copies.map((c) => c.id)
    await db
      .update(schema.pieceCopies)
      .set({
        status: 'processing',
        updatedAt: nowInSecondsBigint(),
      })
      .where(inArray(schema.pieceCopies.id, copyIds))

    for (let i = 0; i < group.copies.length; i += MAX_BATCH_SIZE) {
      filteredGroups.push({
        payer: group.payer,
        sourceProviderId: group.sourceProviderId,
        copies: group.copies.slice(i, i + MAX_BATCH_SIZE),
        privateKey: key.privateKey,
      })
    }
  }

  return filteredGroups
}

/**
 * Updates the status of a group of copies.
 *
 * @param options - The options for the function.
 * @returns The updated copies status.
 */
export async function updateCopiesStatus({
  context,
  ids,
  status,
  error,
  targetProviderId,
  targetDatasetId,
}: {
  context: Context
  ids: bigint[]
  status: PieceCopyStatus
  targetProviderId?: bigint
  targetDatasetId?: bigint
  error?: string
}) {
  const { db, schema } = context

  await db
    .update(schema.pieceCopies)
    .set({
      status,
      error: error ?? null,
      targetProviderId,
      targetDatasetId,
      updatedAt: nowInSecondsBigint(),
    })
    .where(inArray(schema.pieceCopies.id, ids))
}

/**
 * Updates each copy's targetPieceId (and targetDatasetId for newly created datasets)
 * from the confirmed commit result.
 */
export async function updateCopyTargets({
  context,
  copies,
  pieceIds,
  dataSetId,
  blockNumber,
}: {
  context: Context
  copies: CopiesGroup['copies']
  pieceIds: bigint[]
  dataSetId?: bigint
  blockNumber: bigint
}) {
  const { db, schema } = context
  const now = nowInSecondsBigint()

  for (let i = 0; i < copies.length; i++) {
    const copy = copies[i]
    const pieceId = pieceIds[i]
    if (pieceId == null) {
      continue
    }

    await db
      .update(schema.pieceCopies)
      .set({
        targetPieceId: pieceId,
        targetBlockNumber: blockNumber,
        ...(dataSetId !== null && dataSetId !== undefined
          ? { targetDatasetId: dataSetId }
          : {}),
        updatedAt: now,
      })
      .where(eq(schema.pieceCopies.id, copy.id))
  }
}

export type ResolveGroupLocationOptions = {
  context: Context
  payer: Address
  sourceProviderId: bigint
}
export type ResolvedLocation =
  | {
      provider: PDPProvider
      dataset?: undefined
    }
  | {
      provider: PDPProvider
      dataset: PdpDataSet
    }

/**
 * Resolves the location of a group of copies.
 *
 * @param options - The options for the function.
 * @returns The location of the group of copies.
 */
export async function resolveGroupLocation(
  options: ResolveGroupLocationOptions
) {
  const { context, payer, sourceProviderId } = options
  const { publicClient } = context

  const result = await fetchProviderSelectionInput(publicClient, {
    address: payer,
  })

  const selectedProviders = selectProviders({
    ...result,
    count: 1,
    endorsedIds: new Set(),
    excludeProviderIds: new Set([sourceProviderId]),
  })

  if (selectedProviders.length === 0) {
    throw new Error('No providers selected')
  }

  if (selectedProviders[0].dataSetId === null) {
    return {
      provider: selectedProviders[0].provider,
    }
  } else {
    const dataset = await getPdpDataSet(publicClient, {
      dataSetId: selectedProviders[0].dataSetId,
    })
    if (!dataset) {
      throw new Error('Dataset not found')
    }
    return {
      provider: selectedProviders[0].provider,
      dataset,
    }
  }
}

export type SignExtraDataOptions = {
  context: Context
  location: ResolvedLocation
  group: CopiesGroup
}

/**
 * Signs the extra data for a group of copies.
 *
 * @param options - The options for the function.
 * @returns The extra data for the group of copies.
 */
export function signExtraData(options: SignExtraDataOptions) {
  const { context, location } = options

  const walletClient = createWalletClient({
    account: privateKeyToAccount(options.group.privateKey),
    chain: context.chain,
    transport: context.transport,
  })
  if (location.dataset) {
    return signAddPieces(walletClient, {
      clientDataSetId: location.dataset.clientDataSetId,
      pieces: options.group.copies.map((copy) => ({
        pieceCid: Piece.parse(copy.cid),
        metadata: pieceMetadataObjectToEntry(MSP_METADATA),
      })),
    })
  }

  return signCreateDataSetAndAddPieces(walletClient, {
    clientDataSetId: randU256(),
    payee: location.provider.serviceProvider,
    payer: options.group.payer,
    pieces: options.group.copies.map((copy) => ({
      pieceCid: Piece.parse(copy.cid),
      metadata: pieceMetadataObjectToEntry(MSP_METADATA),
    })),
    metadata: datasetMetadataObjectToEntry(MSP_METADATA),
  })
}

export type PullCopiesOptions = {
  context: Context
  location: ResolvedLocation
  group: CopiesGroup
  extraData: Hex
}
export async function pullCopies(options: PullCopiesOptions) {
  const { context, location, group, extraData } = options
  const walletClient = createWalletClient({
    account: privateKeyToAccount(options.group.privateKey),
    chain: context.chain,
    transport: context.transport,
  })

  const sourceProvider = await getPDPProvider(context.publicClient, {
    providerId: options.group.sourceProviderId,
  })
  if (!sourceProvider) {
    throw new Error('Source provider not found')
  }
  const pullPiecesInput = group.copies.map((copy) => ({
    pieceCid: Piece.parse(copy.cid),
    sourceUrl: createPieceUrlPDP({
      cid: copy.cid,
      serviceURL: sourceProvider.pdp.serviceURL,
    }),
  }))

  const basePullOptions: BasePullPiecesOptions = {
    serviceURL: location.provider.pdp.serviceURL,
    pieces: pullPiecesInput,
    extraData,
  }
  const pullOptions = location.dataset
    ? {
        ...basePullOptions,
        dataSetId: location.dataset.dataSetId,
        clientDataSetId: location.dataset.clientDataSetId,
      }
    : {
        ...basePullOptions,
        payee: location.provider.serviceProvider,
        payer: group.payer,
        metadata: MSP_METADATA,
      }

  const response = await SP.waitForPullStatus(walletClient, {
    ...pullOptions,
    onStatus: (response) => {
      context.logger.info(
        { response, serviceURL: location.provider.pdp.serviceURL },
        'Pull pieces status'
      )
    },
  })

  return response
}

export interface CommitCopiesOptions extends CopiesGroup {
  context: Context
  extraData: Hex
  dataset?: {
    clientDataSetId: string
    dataSetId: bigint
  }
  provider: {
    serviceURL: string
    serviceProvider: Address
    payee: Address
  }
}
export type CommitCopiesResult = {
  pieceIds: bigint[]
  dataSetId?: bigint
  blockNumber: bigint
}

export async function commitCopies(
  options: CommitCopiesOptions
): Promise<CommitCopiesResult> {
  const { privateKey, context, extraData } = options
  const walletClient = createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: context.chain,
    transport: context.transport,
  })

  if (options.dataset) {
    const rsp = await SP.addPieces(walletClient, {
      clientDataSetId: BigInt(options.dataset.clientDataSetId),
      dataSetId: options.dataset.dataSetId,
      serviceURL: options.provider.serviceURL,
      pieces: options.copies.map((copy) => ({
        pieceCid: Piece.parse(copy.cid),
        metadata: MSP_METADATA,
      })),
      extraData,
    })
    context.logger.info({ txHash: rsp.txHash }, 'Adding pieces to data set')
    const confirmed = await SP.waitForAddPieces(rsp)

    context.logger.info({ confirmed }, 'Adding pieces to data set confirmed')
    const receipt = await context.publicClient.getTransactionReceipt({
      hash: confirmed.txHash,
    })
    return {
      pieceIds: confirmed.confirmedPieceIds,
      dataSetId: confirmed.dataSetId,
      blockNumber: receipt.blockNumber,
    }
  }

  const rsp = await SP.createDataSetAndAddPieces(walletClient, {
    payee: options.provider.payee,
    payer: options.payer,
    cdn: false,
    serviceURL: options.provider.serviceURL,
    pieces: options.copies.map((copy) => ({
      pieceCid: Piece.parse(copy.cid),
      metadata: MSP_METADATA,
    })),
    extraData,
  })
  context.logger.info(
    { txHash: rsp.txHash },
    'Creating data set and adding pieces'
  )
  const confirmed = await SP.waitForCreateDataSetAddPieces(rsp)
  context.logger.info(
    { confirmed },
    'Creating data set and adding pieces confirmed'
  )
  const receipt = await context.publicClient.getTransactionReceipt({
    hash: confirmed.hash as `0x${string}`,
  })
  return {
    pieceIds: confirmed.piecesIds,
    dataSetId: confirmed.dataSetId,
    blockNumber: receipt.blockNumber,
  }
}
