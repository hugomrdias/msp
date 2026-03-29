import { address, bigint } from '@hugomrdias/foxer'
import { sql } from 'drizzle-orm'
import {
  bigserial,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const pieceCopyStatusEnum = pgEnum('piece_copy_status', [
  'pending',
  'processing',
  'confirmed',
  'failed',
  'orphaned',
])

export type PieceCopyStatus = (typeof pieceCopyStatusEnum.enumValues)[number]

export const pieceCopies = pgTable(
  'pieceCopies',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey(),
    payer: address().notNull(),
    sourceDatasetId: bigint().notNull(),
    sourcePieceId: bigint().notNull(),
    sourceProviderId: bigint().notNull(),
    sourceBlockNumber: bigint().notNull(),
    targetProviderId: bigint(),
    targetDatasetId: bigint(),
    targetPieceId: bigint(),
    cid: text().notNull(),
    size: bigint(),
    status: pieceCopyStatusEnum().notNull(),
    error: text(),
    createdAt: bigint().notNull(),
    updatedAt: bigint(),
  },
  (table) => [
    check(
      'piece_copies_target_provider_not_source_check',
      sql`${table.targetProviderId} IS NULL OR ${table.targetProviderId} <> ${table.sourceProviderId}`
    ),
    index('piece_copies_cid_index').on(table.cid),
    index('piece_copies_payer_index').on(table.payer),
    index('piece_copies_source_piece_index').on(
      table.sourceDatasetId,
      table.sourcePieceId
    ),
    index('piece_copies_status_index').on(table.status),
    index('piece_copies_target_provider_id_index').on(table.targetProviderId),
    uniqueIndex('piece_copies_source_piece_target_provider_unique').on(
      table.sourceDatasetId,
      table.sourcePieceId,
      table.targetProviderId
    ),
  ]
)
