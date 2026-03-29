import { and, eq, exists, inArray, isNotNull, lte, notExists } from 'drizzle-orm'
import type { Context } from '../../foxer.config.ts'
import { nowInSecondsBigint } from '../utils/time.ts'

const TARGET_RESET = {
  targetProviderId: null,
  targetDatasetId: null,
  targetPieceId: null,
  targetBlockNumber: null,
  error: null,
} as const

/**
 * Runs four finalization passes against the DB. Called from the grouping worker
 * on every tick — all passes are lightweight batch SQL with no external calls.
 */
export async function finalizeCopies(context: Context) {
  const { db, schema } = context

  const lastBlockNumber = await context.publicClient.getBlockNumber()
  const finalizedBlockNumber = lastBlockNumber - context.finalityDepth
  const now = nowInSecondsBigint()

  function targetPieceQuery() {
    return db
      .select()
      .from(schema.pieces)
      .where(
        and(
          eq(schema.pieces.datasetId, schema.pieceCopies.targetDatasetId),
          eq(schema.pieces.id, schema.pieceCopies.targetPieceId)
        )
      )
  }

  function targetPieceFinalizedQuery() {
    return db
      .select()
      .from(schema.pieces)
      .where(
        and(
          eq(schema.pieces.datasetId, schema.pieceCopies.targetDatasetId),
          eq(schema.pieces.id, schema.pieceCopies.targetPieceId),
          lte(schema.pieces.blockNumber, finalizedBlockNumber)
        )
      )
  }

  function sourcePieceQuery() {
    return db
      .select()
      .from(schema.pieces)
      .where(
        and(
          eq(schema.pieces.datasetId, schema.pieceCopies.sourceDatasetId),
          eq(schema.pieces.id, schema.pieceCopies.sourcePieceId)
        )
      )
  }

  // Pass 1: confirmed + target piece exists at finalized depth → finalized
  const finalized = await db
    .update(schema.pieceCopies)
    .set({ status: 'finalized', finalizedAt: now, updatedAt: now })
    .where(
      and(
        eq(schema.pieceCopies.status, 'confirmed'),
        isNotNull(schema.pieceCopies.targetPieceId),
        exists(targetPieceFinalizedQuery())
      )
    )
    .returning({ id: schema.pieceCopies.id })

  // Pass 2: finalized + target piece no longer exists → pending (re-replicate)
  const reverified = await db
    .update(schema.pieceCopies)
    .set({ status: 'pending', ...TARGET_RESET, updatedAt: now })
    .where(
      and(
        eq(schema.pieceCopies.status, 'finalized'),
        notExists(targetPieceQuery())
      )
    )
    .returning({ id: schema.pieceCopies.id })

  // Pass 3: confirmed + commit block finalized + target piece missing → pending (reorged)
  const reorged = await db
    .update(schema.pieceCopies)
    .set({ status: 'pending', ...TARGET_RESET, updatedAt: now })
    .where(
      and(
        eq(schema.pieceCopies.status, 'confirmed'),
        isNotNull(schema.pieceCopies.targetBlockNumber),
        lte(schema.pieceCopies.targetBlockNumber, finalizedBlockNumber),
        notExists(targetPieceQuery())
      )
    )
    .returning({ id: schema.pieceCopies.id })

  // Pass 4: confirmed/finalized + source piece missing → orphaned
  const orphaned = await db
    .update(schema.pieceCopies)
    .set({ status: 'orphaned', updatedAt: now })
    .where(
      and(
        inArray(schema.pieceCopies.status, ['confirmed', 'finalized']),
        notExists(sourcePieceQuery())
      )
    )
    .returning({ id: schema.pieceCopies.id })

  return {
    finalized: finalized.length,
    reverified: reverified.length,
    reorged: reorged.length,
    orphaned: orphaned.length,
  }
}
