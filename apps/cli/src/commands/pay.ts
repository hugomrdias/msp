/** biome-ignore-all lint/suspicious/noConsole: cli */
import * as p from '@clack/prompts'
import * as Pay from '@filoz/synapse-core/pay'
import { parseUnits } from '@filoz/synapse-core/utils'
import { Cli, z } from 'incur'
import { waitForTransactionReceipt } from 'viem/actions'
import { privateKeyClient } from '../client.ts'
import { globalOptions } from '../options.ts'
import { hashLink } from '../utils.ts'

export const pay = Cli.create('pay', {
  description: 'Pay commands',
})

pay.command('deposit', {
  description: 'Deposit funds to a wallet',
  args: z.object({
    amount: z.coerce.number().gt(0).describe('Amount to deposit'),
  }),
  options: globalOptions,
  run: async (c) => {
    const { client, chain } = privateKeyClient(c.options.chainId)

    try {
      p.log.info(`Depositing ${c.args.amount} tokens to wallet...`)
      const hash = await Pay.depositAndApprove(client, {
        amount: parseUnits(c.args.amount),
      })
      p.log.info(`Waiting for tx ${hashLink(hash, chain)} to be mined...`)
      await waitForTransactionReceipt(client, {
        hash,
      })
      p.log.success(`Deposited ${c.args.amount} tokens to wallet`)
      return
    } catch (error) {
      if (c.options.debug) {
        console.error(error)
      }
      return c.error({
        code: 'FAILED_TO_DEPOSIT',
        message: (error as Error).message,
      })
    }
  },
})
