#!/usr/bin/env node
import { Cli, z } from 'incur'
import { pay } from './commands/pay.ts'
import { pieces } from './commands/pieces.ts'
import { sessionKeys } from './commands/session-keys.ts'
import { wallet } from './commands/wallet.ts'

const cli = Cli.create('myelin', {
  options: z.object({
    chainId: z.number().optional().describe('Chain ID'),
    debug: z.boolean().optional().describe('Debug mode'),
  }),
  version: '0.0.0',
  description: 'A basic incur CLI app in the myelin workspace.',
})

cli.command(wallet)
cli.command(sessionKeys)
cli.command(pieces)
cli.command(pay)
cli.serve()

export default cli
