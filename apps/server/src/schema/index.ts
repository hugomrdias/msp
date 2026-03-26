import { defineRelations } from 'drizzle-orm/relations'

import { datasets } from './datasets.ts'
import { keys } from './keys.ts'
import { pieceCopies } from './piece-copies.ts'
import { pieces } from './pieces.ts'
import { providers } from './providers.ts'
import { sessionKeyPermissions, sessionKeys } from './session-keys.ts'

export const schema = {
  datasets,
  keys,
  pieceCopies,
  pieces,
  providers,
  sessionKeys,
  sessionKeyPermissions,
}

export const relations = defineRelations(schema, (r) => {
  return {
    datasets: {
      pieces: r.many.pieces(),
    },
    providers: {
      pieceCopies: r.many.pieceCopies(),
    },
    pieces: {
      dataset: r.one.datasets({
        from: r.pieces.datasetId,
        to: r.datasets.dataSetId,
      }),
      copies: r.many.pieceCopies(),
    },
    pieceCopies: {
      sourcePiece: r.one.pieces({
        from: [r.pieceCopies.sourceDatasetId, r.pieceCopies.sourcePieceId],
        to: [r.pieces.datasetId, r.pieces.id],
      }),
      targetProvider: r.one.providers({
        from: r.pieceCopies.targetProviderId,
        to: r.providers.providerId,
      }),
    },
    sessionKeys: {
      permissions: r.many.sessionKeyPermissions(),
    },
    sessionKeyPermissions: {
      sessionKey: r.one.sessionKeys({
        from: r.sessionKeyPermissions.signer,
        to: r.sessionKeys.signer,
      }),
    },
  }
})
