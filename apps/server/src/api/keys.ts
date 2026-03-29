import { Hono } from 'hono'
import type { Address } from 'viem'
import { stringify } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import type { Context } from '../../foxer.config.ts'
import { schema } from '../schema/index.ts'
import { getAllKeysWithStatus, getKeyWithStatus } from '../utils/keys.ts'

export function createKeys(context: Context) {
  const { db } = context
  const app = new Hono()

  app.post('/', async (c) => {
    const privateKey = generatePrivateKey()
    const account = privateKeyToAccount(privateKey)

    await db.insert(schema.keys).values({
      address: account.address,
      privateKey,
    })

    return c.json({
      address: account.address,
    })
  })

  app.get('/:address', async (c) => {
    const address = c.req.param('address') as Address

    const key = await getKeyWithStatus(db, address)
    if (!key) {
      return c.json({ error: `Key ${address} not found` }, 404)
    }
    return c.text(stringify(key), 200, {
      'Content-Type': 'application/json',
    })
  })

  app.get('/', async (c) => {
    const keys = await getAllKeysWithStatus(db)

    return c.text(stringify(keys), 200, {
      'Content-Type': 'application/json',
    })
  })

  return app
}
