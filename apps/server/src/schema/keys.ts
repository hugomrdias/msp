import { address, bigint, hash } from '@hugomrdias/foxer'
import { pgEnum, pgTable, text } from 'drizzle-orm/pg-core'

export const statusEnum = pgEnum('status', [
  'pending', // waiting contract login by the user
  'active', // registered and with proper permissions
  'error', // no proper permissions
  'revoked', // has permissions but are expired
])
export const keys = pgTable('keys', {
  address: address().notNull().primaryKey(),
  owner: address(),
  privateKey: hash().notNull(),
  status: statusEnum().notNull(),
  error: text(),
  expiresAt: bigint(), // the lowest of the required permissions
})
