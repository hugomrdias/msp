/** biome-ignore-all lint/suspicious/noConsole: cli */
import * as p from '@clack/prompts'
import * as SP from '@filoz/synapse-core/sp'
import { getPdpDataSets } from '@filoz/synapse-core/warm-storage'
import { Cli, z } from 'incur'
import { stringify } from 'viem'
import { privateKeyClient } from '../client.ts'
import { globalOptions } from '../options.ts'
import { hashLink, selectProvider } from '../utils.ts'

export const datasets = Cli.create('datasets', {
  description: 'Dataset commands',
})

datasets.command('list', {
  description: 'List datasets for the current wallet',
  options: globalOptions,
  async run(c) {
    const { client } = privateKeyClient(c.options.chainId)

    try {
      const dataSets = await getPdpDataSets(client, {
        address: client.account.address,
      })

      if (dataSets.length === 0) {
        return c.ok({ datasets: [] })
      }

      return c.ok({
        datasets: dataSets.map((ds) => ({
          dataSetId: ds.dataSetId,
          providerId: ds.providerId,
          serviceURL: ds.provider.pdp.serviceURL,
          activePieceCount: ds.activePieceCount,
          pdpEndEpoch: ds.pdpEndEpoch,
          live: ds.live,
          cdn: ds.cdn,
          metadata: ds.metadata,
        })),
      })
    } catch (error) {
      if (c.options.debug) {
        console.error(error)
      }
      return c.error({
        code: 'FAILED_TO_LIST_DATASETS',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  },
})

datasets.command('create', {
  description: 'Create a new dataset with a provider',
  options: globalOptions.extend({
    cdn: z.boolean().optional().default(false).describe('Enable CDN'),
  }),
  async run(c) {
    const { client, chain } = privateKeyClient(c.options.chainId)

    try {
      const provider = await selectProvider(client, c.options)
      if (!provider) {
        return c.error({
          code: 'NO_PROVIDER_SELECTED',
          message: 'No provider selected',
        })
      }

      p.log.info(
        `Creating dataset with provider #${provider.id} (${provider.pdp.serviceURL})...`
      )

      const result = await SP.createDataSet(client, {
        serviceURL: provider.pdp.serviceURL,
        payee: provider.payee,
        cdn: c.options.cdn,
      })

      p.log.step(
        `Waiting for tx ${hashLink(result.txHash, chain)} to be confirmed...`
      )

      const created = await SP.waitForCreateDataSet({
        statusUrl: result.statusUrl,
      })

      p.log.success(`Dataset #${created.dataSetId} created.`)

      return c.ok({
        dataSetId: stringify(created.dataSetId),
        txHash: created.createMessageHash,
      })
    } catch (error) {
      if (c.options.debug) {
        console.error(error)
      }
      return c.error({
        code: 'FAILED_TO_CREATE_DATASET',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  },
})
