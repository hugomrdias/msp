import {
  AddPiecesPermission,
  CreateDataSetPermission,
} from '@filoz/synapse-core/session-key'
import { buildConflictUpdateColumns } from '@hugomrdias/foxer'
import { eq } from 'drizzle-orm'

import type { Registry } from '../../foxer.config.ts'
import { schema } from '../schema/index.ts'

// TODO add contract to the context

const REQUIRED_PERMISSIONS = [
  AddPiecesPermission,
  CreateDataSetPermission,
] as const

export function handleSessionKeys(registry: Registry) {
  registry.on(
    'sessionKeyRegistry:AuthorizationsUpdated',
    async ({ context, event }) => {
      context.logger.trace(
        { event: event.args, transaction: event.transaction.hash },

        'AuthorizationsUpdated'
      )

      const permissions = new Set(event.args.permissions)
      const missingPermissions = REQUIRED_PERMISSIONS.filter(
        (permission) => !permissions.has(permission)
      )
      const hasRequiredPermissions = missingPermissions.length === 0
      const isExpired =
        event.args.expiry != null && event.args.expiry <= event.block.timestamp
      const status = hasRequiredPermissions
        ? isExpired
          ? 'revoked'
          : 'active'
        : 'error'
      const error = hasRequiredPermissions
        ? null
        : `Missing permissions: ${missingPermissions.join(', ')}`

      // update the key
      await context.db
        .update(schema.keys)
        .set({
          owner: event.args.identity,
          status,
          error,
          expiresAt: hasRequiredPermissions ? event.args.expiry : null,
        })
        .where(eq(schema.keys.address, event.args.signer))

      // insert the session key
      await context.db
        .insert(schema.sessionKeys)
        .values({
          signer: event.args.signer,
          identity: event.args.identity,
          origin: event.args.origin,
          blockNumber: event.block.number,
          createdAt: event.block.timestamp,
          updatedAt: event.block.timestamp,
        })
        .onConflictDoUpdate({
          target: [schema.sessionKeys.signer],
          set: {
            origin: event.args.origin,
            updatedAt: event.block.timestamp,
          },
        })

      await context.db
        .insert(schema.sessionKeyPermissions)
        .values(
          event.args.permissions.map((permission) => ({
            signer: event.args.signer,
            permission: permission,
            expiry: event.args.expiry,
          }))
        )
        .onConflictDoUpdate({
          target: [
            schema.sessionKeyPermissions.signer,
            schema.sessionKeyPermissions.permission,
          ],
          set: buildConflictUpdateColumns(schema.sessionKeyPermissions, [
            'expiry',
          ]),
        })
    }
  )
}
