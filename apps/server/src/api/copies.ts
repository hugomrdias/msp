import { sValidator } from '@hono/standard-validator'
import { Hono } from 'hono'
import { stringify } from 'viem'
import * as z from 'zod'

import { zHex } from '../utils/schemas.ts'
import type { FoxerContext } from './index.ts'

export function createCopies(context: FoxerContext) {
  const { db } = context
  const app = new Hono()

  const copiesParamsSchema = z.object({
    limit: z.coerce.number().min(1).max(100).optional().default(50),
    offset: z.coerce.number().optional().default(0),
    address: zHex.optional(),
    datasetId: z.coerce.bigint().optional(),
  })

  app.get('/', sValidator('query', copiesParamsSchema), async (c) => {
    const { limit, offset, address, datasetId } = c.req.valid('query')

    const where = {
      ...(address ? { owner: address } : undefined),
      ...(datasetId ? { sourceDatasetId: datasetId } : undefined),
    }

    if (Object.keys(where).length === 0) {
      return c.text(
        'At least one filter is required: address and/or datasetId',
        400
      )
    }

    const rows = await db.query.pieceCopies.findMany({
      where,
      orderBy: {
        requestedAt: 'desc',
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

  return app
}
