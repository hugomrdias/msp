import * as Piece from '@filoz/synapse-core/piece'
import { metadataArrayToObject } from '@filoz/synapse-core/utils'
import type { Logger } from '@hugomrdias/foxer'
import { and, eq, inArray } from 'drizzle-orm'
import type { Database, Registry } from '../../foxer.config.ts'
import { schema } from '../schema/index.ts'

export function handlePieces(registry: Registry) {
  registry.on('storage:PieceAdded', async ({ context, event }) => {
    context.logger.silent({ event: event.args }, 'PieceAdded')
    const args = event.args

    const metadata = metadataArrayToObject([args.keys, args.values])
    const cid = Piece.hexToPieceCID(args.pieceCid.data)
    const size = BigInt(Piece.getSizeFromPieceCID(cid))
    const dataset = await context.db.query.datasets.findFirst({
      where: {
        dataSetId: args.dataSetId,
      },
      columns: {
        payer: true,
        providerId: true,
      },
    })

    if (!dataset) {
      context.logger.silent({ args }, 'Dataset not found')
      return
    }

    await context.db
      .insert(schema.pieces)
      .values({
        id: args.pieceId,
        address: dataset.payer,
        blockNumber: event.block.number,
        datasetId: args.dataSetId,
        cid: cid.toString(),
        size,
        metadata,
      })
      .onConflictDoNothing()

    await ensurePieceCopyIntent({
      context,
      owner: dataset.payer,
      sourceDatasetId: args.dataSetId,
      sourcePieceId: args.pieceId,
      sourceProviderId: dataset.providerId,
      cid: cid.toString(),
      size,
      timestamp: event.block.timestamp,
    })
  })

  registry.on('pdpVerifier:PiecesRemoved', async ({ context, event }) => {
    context.logger.silent({ event: event.args }, 'PiecesRemoved')
    const args = event.args
    if (args.pieceIds.length === 0) {
      return
    }

    await context.db
      .update(schema.pieceCopies)
      .set({
        status: 'orphaned',
        updatedAt: event.block.timestamp,
      })
      .where(
        and(
          eq(schema.pieceCopies.sourceDatasetId, args.setId),
          inArray(schema.pieceCopies.sourcePieceId, args.pieceIds)
        )
      )

    await context.db
      .delete(schema.pieces)
      .where(
        and(
          eq(schema.pieces.datasetId, args.setId),
          inArray(schema.pieces.id, args.pieceIds)
        )
      )
  })
}

/**
 * Ensures a piece copy intent is created for a given piece.
 *
 * @param context - The context object.
 * @param owner - The owner of the piece.
 * @param sourceDatasetId - The ID of the source dataset.
 * @param sourcePieceId - The ID of the source piece.
 * @param sourceProviderId - The ID of the source provider.
 * @param cid - The CID of the piece.
 * @param size - The size of the piece.
 * @param timestamp - The timestamp of the block.
 * @returns A promise that resolves to void.
 */
async function ensurePieceCopyIntent({
  context,
  owner,
  sourceDatasetId,
  sourcePieceId,
  sourceProviderId,
  cid,
  size,
  timestamp,
}: {
  context: {
    db: Database
    logger: Logger
  }
  owner: `0x${string}`
  sourceDatasetId: bigint
  sourcePieceId: bigint
  sourceProviderId: bigint
  cid: string
  size: bigint
  timestamp: bigint
}) {
  const key = await context.db.query.keys.findFirst({
    where: {
      owner,
      status: 'active',
    },
    columns: {
      owner: true,
    },
  })

  if (!key?.owner) {
    return
  }

  const existingCopy = await context.db.query.pieceCopies.findFirst({
    where: {
      sourceDatasetId,
      sourcePieceId,
    },
    columns: {
      id: true,
      status: true,
    },
  })

  if (!existingCopy) {
    await context.db.insert(schema.pieceCopies).values({
      owner,
      sourceDatasetId,
      sourcePieceId,
      sourceProviderId,
      cid,
      size,
      status: 'pending',
      requestedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    return
  }

  if (existingCopy.status !== 'orphaned') {
    return
  }

  await context.db
    .update(schema.pieceCopies)
    .set({
      owner,
      sourceProviderId,
      cid,
      size,
      status: 'pending',
      error: null,
      updatedAt: timestamp,
    })
    .where(eq(schema.pieceCopies.id, existingCopy.id))
}
