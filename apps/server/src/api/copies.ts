import { sValidator } from '@hono/standard-validator'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { stringify } from 'viem'
import * as z from 'zod'
import type { Context } from '../../foxer.config.ts'
import { schema } from '../schema/index.ts'
import { pieceCopyStatusEnum } from '../schema/piece-copies.ts'
import { zHex } from '../utils/schemas.ts'

export function createCopies(context: Context) {
  const { db } = context
  const app = new Hono()

  const copiesParamsSchema = z.object({
    limit: z.coerce.number().min(1).max(100).optional().default(50),
    offset: z.coerce.number().optional().default(0),
    payer: zHex.optional(),
    datasetId: z.coerce.bigint().optional(),
    status: z.enum(pieceCopyStatusEnum.enumValues).optional(),
  })

  app.get('/', sValidator('query', copiesParamsSchema), async (c) => {
    const { limit, offset, payer, datasetId, status } = c.req.valid('query')

    const where = {
      ...(payer ? { payer } : undefined),
      ...(datasetId ? { sourceDatasetId: datasetId } : undefined),
      ...(status ? { status } : undefined),
    }

    if (!payer && !datasetId) {
      return c.text(
        'At least one filter is required: payer and/or datasetId',
        400
      )
    }

    const conditions = []
    if (payer) conditions.push(eq(schema.pieceCopies.payer, payer))
    if (datasetId)
      conditions.push(eq(schema.pieceCopies.sourceDatasetId, datasetId))
    if (status) conditions.push(eq(schema.pieceCopies.status, status))

    const [rows, total] = await Promise.all([
      db.query.pieceCopies.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
          id: 'desc',
        },
        limit,
        offset,
      }),
      db.$count(schema.pieceCopies, and(...conditions)),
    ])

    return c.text(
      stringify({
        items: rows,
        total,
        limit,
        offset,
      }),
      200,
      { 'Content-Type': 'application/json' }
    )
  })

  return app
}
