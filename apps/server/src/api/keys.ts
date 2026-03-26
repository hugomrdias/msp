// authors.ts

import { Hono } from 'hono'
import type { Address } from 'viem'
import { stringify } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { schema } from '../schema/index.ts'
import type { FoxerContext } from './index.ts'

export function createKeys(context: FoxerContext) {
  const { db } = context
  const app = new Hono()
  app.post('/', async (c) => {
    const privateKey = generatePrivateKey()

    const account = privateKeyToAccount(privateKey)

    // insert the key into the database
    await db.insert(schema.keys).values({
      address: account.address,
      privateKey,
      status: 'pending',
    })

    return c.json({
      address: account.address,
    })
  })

  app.get('/:address', async (c) => {
    const address = c.req.param('address') as Address

    const key = await db.query.keys.findFirst({
      where: {
        address: address,
      },
    })
    if (!key) {
      return c.json({ error: `Key ${address} not found` }, 404)
    }
    return c.text(stringify(key), 200, {
      'Content-Type': 'application/json',
    })
  })

  app.get('/', async (c) => {
    const keys = await db.query.keys.findMany()

    return c.text(stringify(keys), 200, {
      'Content-Type': 'application/json',
    })
  })

  return app
}
