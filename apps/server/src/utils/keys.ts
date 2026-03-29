import {
  AddPiecesPermission,
  CreateDataSetPermission,
} from '@filoz/synapse-core/session-key'
import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm'
import type { Database } from '../../foxer.config.ts'
import { schema } from '../schema/index.ts'
import { nowInSecondsBigint } from './time.ts'

const REQUIRED_PERMISSIONS: readonly `0x${string}`[] = [
  AddPiecesPermission,
  CreateDataSetPermission,
]

/**
 * Finds an active MSP-managed key for the given payer by joining
 * `keys` → `sessionKeys` → `sessionKeyPermissions`.
 *
 * A key is "active" when both required permissions (AddPieces, CreateDataSet)
 * are present and not expired.
 */
export async function findActiveKey(db: Database, payer: `0x${string}`) {
  const now = nowInSecondsBigint()

  const [key] = await db
    .select({
      address: schema.keys.address,
      privateKey: schema.keys.privateKey,
      payer: schema.sessionKeys.payer,
    })
    .from(schema.keys)
    .innerJoin(
      schema.sessionKeys,
      eq(schema.keys.address, schema.sessionKeys.signer)
    )
    .innerJoin(
      schema.sessionKeyPermissions,
      eq(schema.keys.address, schema.sessionKeyPermissions.signer)
    )
    .where(
      and(
        eq(schema.sessionKeys.payer, payer),
        inArray(schema.sessionKeyPermissions.permission, [
          ...REQUIRED_PERMISSIONS,
        ]),
        or(
          isNull(schema.sessionKeyPermissions.expiry),
          gt(schema.sessionKeyPermissions.expiry, now)
        )
      )
    )
    .groupBy(
      schema.keys.address,
      schema.keys.privateKey,
      schema.sessionKeys.payer
    )
    .having(
      sql`count(distinct ${schema.sessionKeyPermissions.permission}) = ${REQUIRED_PERMISSIONS.length}`
    )
    .limit(1)

  return key ?? null
}

export type KeyStatus = 'pending' | 'active' | 'error' | 'revoked'

export interface KeyWithStatus {
  address: `0x${string}`
  privateKey: `0x${string}`
  payer: `0x${string}` | null
  status: KeyStatus
  expiresAt: bigint | null
}

/**
 * Derives the full key record with computed status for a single key address.
 * Used by the API layer.
 */
export async function getKeyWithStatus(
  db: Database,
  address: `0x${string}`
): Promise<KeyWithStatus | null> {
  const key = await db.query.keys.findFirst({
    where: { address },
  })
  if (!key) return null

  const sessionKey = await db.query.sessionKeys.findFirst({
    where: { signer: address },
    with: { permissions: true },
  })

  if (!sessionKey) {
    return {
      address: key.address,
      privateKey: key.privateKey,
      payer: null,
      status: 'pending',
      expiresAt: null,
    }
  }

  const requiredPerms = sessionKey.permissions.filter((p) =>
    REQUIRED_PERMISSIONS.includes(p.permission)
  )

  if (requiredPerms.length < REQUIRED_PERMISSIONS.length) {
    return {
      address: key.address,
      privateKey: key.privateKey,
      payer: sessionKey.payer,
      status: 'error',
      expiresAt: null,
    }
  }

  const now = nowInSecondsBigint()
  const allExpired = requiredPerms.every(
    (p) => p.expiry != null && p.expiry <= now
  )

  if (allExpired) {
    return {
      address: key.address,
      privateKey: key.privateKey,
      payer: sessionKey.payer,
      status: 'revoked',
      expiresAt: requiredPerms[0]?.expiry ?? null,
    }
  }

  const minExpiry = requiredPerms.reduce<bigint | null>((min, p) => {
    if (p.expiry == null) return min
    if (min == null) return p.expiry
    return p.expiry < min ? p.expiry : min
  }, null)

  return {
    address: key.address,
    privateKey: key.privateKey,
    payer: sessionKey.payer,
    status: 'active',
    expiresAt: minExpiry,
  }
}

/**
 * Derives status for all MSP-managed keys. Used by the API layer.
 */
export async function getAllKeysWithStatus(
  db: Database
): Promise<KeyWithStatus[]> {
  const keys = await db.query.keys.findMany()
  const results: KeyWithStatus[] = []
  for (const key of keys) {
    const withStatus = await getKeyWithStatus(db, key.address)
    if (withStatus) results.push(withStatus)
  }
  return results
}
