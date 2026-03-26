import { bigint } from '@hugomrdias/foxer'
import {
  index,
  json,
  pgEnum,
  pgTable,
  primaryKey,
  text,
} from 'drizzle-orm/pg-core'

export const pieceCopyStatusEnum = pgEnum('piece_copy_status', [
  'pending',
  'uploading',
  'submitted',
  'confirmed',
  'finalized',
  'failed',
  'orphaned',
])

export const pieceCopies = pgTable(
  'piece_copies',
  {
    sourceDatasetId: bigint().notNull(),
    sourcePieceId: bigint().notNull(),
    sourceProviderId: bigint().notNull(),
    targetProviderId: bigint().notNull(),
    targetDatasetId: bigint(),
    targetPieceId: bigint(),
    cid: text().notNull(),
    size: bigint(),
    status: pieceCopyStatusEnum().notNull(),
    error: text(),
    metadata: json().$type<Record<string, unknown>>(),
    requestedAt: bigint().notNull(),
    createdAt: bigint(),
    updatedAt: bigint(),
    finalizedAt: bigint(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.sourceDatasetId,
        table.sourcePieceId,
        table.targetProviderId,
      ],
    }),
    index('piece_copies_cid_index').on(table.cid),
    index('piece_copies_status_index').on(table.status),
    index('piece_copies_target_provider_id_index').on(table.targetProviderId),
  ]
)
