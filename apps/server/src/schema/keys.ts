import { address, hash } from '@hugomrdias/foxer'
import { pgTable } from 'drizzle-orm/pg-core'

export const keys = pgTable('keys', {
  address: address().notNull().primaryKey(),
  privateKey: hash().notNull(),
})
