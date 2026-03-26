/** biome-ignore-all lint/suspicious/noConsole: cli */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as p from '@clack/prompts'
import * as Piece from '@filoz/synapse-core/piece'
import * as SP from '@filoz/synapse-core/sp'
import type { PDPProvider } from '@filoz/synapse-core/sp-registry'
import {
  getPdpDataSet,
  type PdpDataSet,
} from '@filoz/synapse-core/warm-storage'
import { Cli, z } from 'incur'
import { privateKeyClient } from '../client.ts'
import { globalOptions } from '../options.ts'
import { hashLink, selectDataSet, selectProvider } from '../utils.ts'

export const pieces = Cli.create('pieces', {
  description: 'Pieces commands',
})

pieces.command('add', {
  description: 'Add a new piece to a dataset',
  args: z.object({
    file: z.string().describe('File to add'),
  }),
  options: globalOptions.extend({
    datasetId: z.string().describe('Dataset ID').optional(),
  }),
  async run(c) {
    const { client, chain } = privateKeyClient(c.options.chainId)

    const filePath = c.args.file
    const absolutePath = path.resolve(filePath)
    const fileData = await readFile(absolutePath)

    try {
      let provider: PDPProvider | undefined
      let dataSet: PdpDataSet | undefined

      const dataSetId = c.options.datasetId
        ? BigInt(c.options.datasetId)
        : await selectDataSet(client, c.options)

      if (dataSetId) {
        dataSet = await getPdpDataSet(client, {
          dataSetId,
        })
        if (!dataSet) {
          return c.error({
            code: 'DATA_SET_NOT_FOUND',
            message: 'Data set not found',
          })
        }
        provider = dataSet.provider
      } else {
        provider = await selectProvider(client, c.options)
      }

      if (!provider) {
        return c.error({
          code: 'NO_DATA_SET_OR_PROVIDER_SELECTED',
          message: 'No data set or provider selected',
        })
      }
      p.log.info(`Uploading file ${absolutePath}...`)
      const pieceCid = Piece.calculate(fileData)
      await SP.uploadPiece({
        data: fileData,
        serviceURL: provider.pdp.serviceURL,
        pieceCid,
      })

      await SP.findPiece({
        pieceCid,
        serviceURL: provider.pdp.serviceURL,
        retry: true,
      })

      if (dataSet) {
        const addedPieces = await SP.addPieces(client, {
          dataSetId: dataSet.dataSetId,
          serviceURL: dataSet.provider.pdp.serviceURL,
          clientDataSetId: dataSet.clientDataSetId,
          pieces: [
            {
              pieceCid,
            },
          ],
        })
        p.log.info(
          `Waiting for tx ${hashLink(addedPieces.txHash, chain)} to be mined...`
        )
        await SP.waitForAddPieces(addedPieces)
        p.log.success(`Piece ${pieceCid} added to data set ${dataSetId}`)
        return
      }

      if (!dataSet && provider) {
        const result = await SP.createDataSetAndAddPieces(client, {
          serviceURL: provider.pdp.serviceURL,
          payee: provider.payee,
          cdn: false,
          pieces: [
            {
              pieceCid,
            },
          ],
        })
        p.log.info(
          `Waiting for tx ${hashLink(result.txHash, chain)} to be mined...`
        )
        const created = await SP.waitForCreateDataSetAddPieces(result)
        p.log.success(
          `Piece ${pieceCid} added to data set ${created.dataSetId}`
        )
        return
      }
    } catch (error) {
      if (c.options.debug) {
        console.error(error)
      }
      return c.error({
        code: 'FAILED_TO_ADD_PIECE',
        message: (error as Error).message,
      })
    }
  },
})
