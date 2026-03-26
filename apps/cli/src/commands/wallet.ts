/** biome-ignore-all lint/suspicious/noConsole: cli */
import * as p from '@clack/prompts'
import { outro, text } from '@clack/prompts'
import * as ERC20 from '@filoz/synapse-core/erc20'
import { claimTokens, formatBalance } from '@filoz/synapse-core/utils'
import { Cli, z } from 'incur'
import type { Hash } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { getBalance, waitForTransactionReceipt } from 'viem/actions'
import { privateKeyClient } from '../client.ts'
import { config } from '../config.ts'
import { globalOptions } from '../options.ts'
import { hashLink } from '../utils.ts'

export const wallet = Cli.create('wallet', {
  description: 'Wallet commands',
})

wallet.command('create', {
  description: 'Create a new wallet',
  options: globalOptions.extend({
    new: z.boolean().optional().default(false).describe('Create a new wallet'),
    privateKey: z.string().optional().describe('Private key to use'),
  }),
  run: async (c) => {
    const privateKey = config.get('privateKey')
    const toWalletResult = (privateKey: string) => {
      const account = privateKeyToAccount(privateKey as Hash)

      return {
        privateKey,
        address: account.address,
        config: config.path,
      }
    }
    const saveWallet = (privateKey: string) => {
      config.set('privateKey', privateKey)
      return toWalletResult(privateKey)
    }

    if (c.options.new) {
      return saveWallet(generatePrivateKey())
    }

    if (privateKey) {
      return toWalletResult(privateKey)
    }

    const privateKeyInput =
      c.options.privateKey ??
      (await text({
        message: 'Enter your private key',
        validate(value) {
          if (!value || !/^0x[a-fA-F0-9]{64}$/.test(value)) {
            return `Invalid private key!`
          }
        },
      }))

    if (p.isCancel(privateKeyInput)) {
      outro(`Initialization cancelled`)
      return
    }

    return saveWallet(privateKeyInput)
  },
})

wallet.command('fund', {
  description: 'Fund a wallet',
  options: globalOptions,
  async *run(c) {
    const { client, chain } = privateKeyClient(c.options.chainId)

    yield 'Funding wallet...'
    try {
      const hashes = await claimTokens({ address: client.account.address })

      yield `Waiting for tx ${hashLink(hashes[0].tx_hash, chain)} to be mined...`
      await waitForTransactionReceipt(client, {
        hash: hashes[0].tx_hash,
      })
      const balance = await getBalance(client, {
        address: client.account.address,
      })
      yield {
        address: client.account.address,
        balance: formatBalance({ value: balance }),
      }
    } catch (error) {
      if (c.options.debug) {
        console.error(error)
      }
      return c.error({
        code: 'FAILED_TO_FUND_WALLET',
        message: 'Failed to fund wallet',
      })
    }
  },
})

wallet.command('balance', {
  description: 'Get the balance of a wallet',
  options: globalOptions,
  async run(c) {
    const { client } = privateKeyClient(c.options.chainId)
    const balanceFIL = await getBalance(client, {
      address: client.account.address,
    })

    const balanceUSDFC = await ERC20.balance(client, {
      address: client.account.address,
    })
    return {
      address: client.account.address,
      balanceFIL: formatBalance({ value: balanceFIL }),
      balanceUSDFC: formatBalance({ value: balanceUSDFC.value }),
    }
  },
})
