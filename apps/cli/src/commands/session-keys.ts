/** biome-ignore-all lint/suspicious/noConsole: cli */
import * as p from '@clack/prompts'
import * as SessionKey from '@filoz/synapse-core/session-key'
import { Cli, z } from 'incur'
import { stringify } from 'viem'
import { type Address, generatePrivateKey } from 'viem/accounts'
import { privateKeyClient } from '../client.ts'
import { globalOptions } from '../options.ts'
import { hashLink } from '../utils.ts'

export const sessionKeys = Cli.create('session-keys', {
  description: 'Session keys commands',
})

sessionKeys.command('create', {
  description: 'Create a new session key and approves Synapse Core permissions',
  options: globalOptions,
  async run(c) {
    const { client, chain } = privateKeyClient(c.options.chainId)
    const sessionKey = SessionKey.fromSecp256k1({
      privateKey: generatePrivateKey(),
      root: client.account,
      chain,
    })
    p.log.info(`Root address: ${sessionKey.account.rootAddress}`)
    p.log.info(`Session key address: ${sessionKey.account.address}`)
    const { event: loginEvent } = await SessionKey.loginSync(client, {
      address: sessionKey.address,
      onHash(hash) {
        p.log.step(`Waiting for tx ${hashLink(hash, chain)} to be mined...`)
      },
    })

    p.log.success(`Login event: ${stringify(loginEvent.args)}`)
  },
})

sessionKeys.command('approve', {
  description: 'Approves Synapse Core permissions',
  args: z.object({
    address: z.string().describe('Session key address'),
  }),
  options: globalOptions,
  async run(c) {
    const { client, chain } = privateKeyClient(c.options.chainId)

    const { event: loginEvent } = await SessionKey.loginSync(client, {
      address: c.args.address as Address,
      onHash(hash) {
        p.log.step(`Waiting for tx ${hashLink(hash, chain)} to be mined...`)
      },
    })

    p.log.success(`Login event: ${stringify(loginEvent.args)}`)
  },
})

sessionKeys.command('revoke', {
  description: 'Revoke a session key',
  args: z.object({
    address: z.string().describe('Session key address'),
  }),
  options: globalOptions,
  async run(c) {
    const { client, chain } = privateKeyClient(c.options.chainId)
    try {
      p.log.info(`Revoking session key ${c.args.address}...`)

      await SessionKey.revokeSync(client, {
        address: c.args.address as Address,
        onHash(hash) {
          p.log.step(`Waiting for tx ${hashLink(hash, chain)} to be mined...`)
        },
      })

      p.log.success(`Session key revoked`)
      return c.ok({
        address: c.args.address,
      })
    } catch (error) {
      if (c.options.debug) {
        console.error(error)
      }
      return c.error({
        code: 'FAILED_TO_REVOKE_SESSION_KEY',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  },
})
