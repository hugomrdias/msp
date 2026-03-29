import { sValidator } from '@hono/standard-validator'
import type { Logger } from '@hugomrdias/foxer'
import { sqlMiddleware } from '@hugomrdias/foxer/api'
import { eq, sum } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { stringify } from 'viem'
import * as z from 'zod'
import type { Context } from '../../foxer.config.ts'
import { startQueue } from '../replication/queue.ts'
import { schema } from '../schema/index.ts'
import { zHex } from '../utils/schemas.ts'
import { createCopies } from './copies.ts'
import { createKeys } from './keys.ts'

export function createApi(context: Context) {
  const { db } = context

  startQueue(context)

  const app = new Hono()
  app.use(cors())
  app.use('/sql/*', sqlMiddleware(context))

  app.route('/copies', createCopies(context))
  app.route('/keys', createKeys(context))

  const piecesParamsSchema = z.object({
    limit: z.coerce.number().min(1).max(100).optional().default(50),
    offset: z.coerce.number().optional().default(0),
    address: zHex.optional(),
    datasetId: z.coerce.bigint().optional(),
  })
  app.get('/pieces', sValidator('query', piecesParamsSchema), async (c) => {
    const { limit, offset, address, datasetId } = c.req.valid('query')

    const where = {
      ...(address ? { payer: address } : undefined),
      ...(datasetId ? { datasetId } : undefined),
    }

    if (Object.keys(where).length === 0) {
      return c.text(
        'At least one filter is required: address and/or datasetId',
        400
      )
    }

    const rows = await db.query.pieces.findMany({
      where,
      orderBy: {
        blockNumber: 'desc',
        id: 'desc',
      },
      limit,
      offset,
    })

    return c.text(
      stringify({
        items: rows,
        limit,
        offset,
      }),
      200,
      { 'Content-Type': 'application/json' }
    )
  })

  const totalsByAddressSchema = z.object({
    address: zHex,
  })
  app.get(
    '/totals-by-address',
    sValidator('query', totalsByAddressSchema),
    async (c) => {
      const { address } = c.req.valid('query')

      const datasetsCount = await db.$count(
        db._.fullSchema.datasets,
        eq(db._.fullSchema.datasets.payer, address)
      )
      const piecesCount = await db.$count(
        db._.fullSchema.pieces,
        eq(db._.fullSchema.pieces.payer, address)
      )
      const piecesSize = await db
        .select({ value: sum(schema.pieces.size) })
        .from(schema.pieces)
        .where(eq(schema.pieces.payer, address))
      const sessionKeysCount = await db.$count(
        db._.fullSchema.sessionKeys,
        eq(db._.fullSchema.sessionKeys.payer, address)
      )

      return c.text(
        stringify({
          datasets: datasetsCount,
          pieces: piecesCount,
          piecesSize: piecesSize[0]?.value ? BigInt(piecesSize[0].value) : 0n,
          sessionKeys: sessionKeysCount,
        }),
        200,
        { 'Content-Type': 'application/json' }
      )
    }
  )

  return app
}
