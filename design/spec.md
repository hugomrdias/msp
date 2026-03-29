# Spec

## What is MSP

MSP is a background replication service for [Filecoin Onchain Cloud][FOC]. It manages Session Keys approved by the users in the Session Key Registry contract and uses those to replicate uploads (Pieces) to different Service Providers registered in the Service Provider Registry contract. When the user wants to enable replication, they request a key address from MSP and approve it; after that all uploads are replicated. Replication options are managed by the user using the Piece metadata; by default MSP creates one extra copy.

## Filecoin Onchain Cloud smart contracts

- PDP Verifier: Proof of Data Possession (PDP) - Data Verification Service Contract
  - [design document](https://github.com/FilOzone/pdp/blob/main/docs/design.md)
  - [source code](https://github.com/FilOzone/pdp)
  - folder `/src/pdp-verifier`
- Filecoin Pay: The Filecoin Pay V1 contract enables ERC20 token payment flows through "rails" - automated payment channels between payers and recipients. The contract supports continuous rate based payments, one-time transfers, and payment validation during settlement.
  - [design document](https://github.com/FilOzone/filecoin-pay/blob/main/README.md)
  - [source code](https://github.com/FilOzone/filecoin-pay)
  - folder: `/src/pay`
- FWSS Filecoin Warm Storage Service, a comprehensive service contract that combines PDP (Proof of Data Possession) verification with integrated payment rails for data set management.
  - [design document](https://github.com/FilOzone/filecoin-services/blob/main/SPEC.md)
  - [source code](https://github.com/FilOzone/filecoin-services)
  - folder: `/src/warm-storage`
- Session Key Registry: Session keys are disposable keys for dapps to perform actions on the user's behalf. Session keys are scoped to constrain the actions they can take.
  - [source code](https://github.com/FilOzone/SessionKeyRegistry)
- Service Provider Registry: a registry contract for managing service providers across the Filecoin Onchain Cloud
  - [source code](https://github.com/FilOzone/filecoin-services/blob/main/service_contracts/src/ServiceProviderRegistry.sol)
- ProviderIdSet: smart contract to manage endorsed providers
  - [source core](https://github.com/FilOzone/filecoin-services/blob/main/service_contracts/src/ProviderIdSet.sol)

## MSP components

### Server

MSP server uses [Foxer][Foxer] for indexing the Filecoin chain, HTTP api, database schema and migrations. Using indexing functions MSP keeps track of the session keys approved or revoked by the user, and pieces and datasets created by users with MSP session keys.
Replication is done using [bunqueue][bunqueue] to have a persistent embedded queue system to keep track of all the replication jobs.
Onchain operations are all done with [`@filoz/synapse-core`][synapse-core].

#### Indexing

The server indexes the users Datasets, Pieces, Service Providers and Session Keys from the chain itself; this is the primary source of truth for the replication pipeline.

Extra data related to replication:

- Pieces SHOULD have an extra column called `copy` when a piece was added by MSP this can be checked by looking into the metadata and looking for a key-pair `{ source: 'msp' }`
- Datasets SHOULD have an extra column called `copy` when created by MSP this can be checked by looking into the metadata and looking for a key-pair `{ source: 'msp' }`

#### Replication

For replication MSP has two database tables `keys` and `copies`.

##### Keys

The `keys` table stores server-managed session key material. Key *status* is derived at query time from the Foxer-managed `sessionKeys` and `sessionKeyPermissions` tables, which makes the system reorg-safe.

###### Schema

The `keys` table holds only key material — no chain-derived state:

```jsx
export const keys = pgTable('keys', {
  address: address().notNull().primaryKey(),
  privateKey: hash().notNull(),
})
```

###### Derived status

Status is computed by joining `keys` → `sessionKeys` (for payer) → `sessionKeyPermissions` (for permission + expiry checks). The required permissions are `AddPieces` and `CreateDataSet`:

- **`pending`** — No matching `sessionKeys` row exists for this key address. The key was created via `POST /keys` but the user has not yet called `login()`.
- **`active`** — A `sessionKeys` row exists and `sessionKeyPermissions` contains both required permissions with `expiry > now`.
- **`error`** — A `sessionKeys` row exists but one or more required permissions are missing.
- **`revoked`** — A `sessionKeys` row exists and both permissions are present but expired (`expiry ≤ now`).

Re-authorization is implicit: calling `login()` again inserts/updates `sessionKeys` and `sessionKeyPermissions`, so the derived status transitions back to `active` if the permissions are correct.

###### Flow

1. `POST /keys` generates a private key, stores `{ address, privateKey }` in `keys`, and returns the address.
2. The user approves the key on-chain (e.g. CLI `session-keys msp` calls `SessionKey.loginSync`).
3. The Foxer indexer picks up the `AuthorizationsUpdated` event. The handler inserts/updates `sessionKeys` (with `blockNumber`) and upserts `sessionKeyPermissions`. It does **not** touch the `keys` table.
4. Pipeline queries (`ensurePieceCopyIntent`, `groupCopies`) join `keys` with `sessionKeys`/`sessionKeyPermissions` to find keys with active permissions for a given payer.

###### Reorg safety

Because status is derived from `sessionKeys` (which has a `blockNumber` column) and `sessionKeyPermissions` (which cascade-deletes via FK), Foxer's built-in reorg handling keeps everything consistent:

1. Reorg at block N → Foxer deletes `sessionKeys` rows where `blockNumber ≥ N` → cascade deletes the associated `sessionKeyPermissions`.
2. Derived status for affected keys automatically falls back to `pending`.
3. Re-indexing replays the surviving events and restores the correct `sessionKeys`/`sessionKeyPermissions` rows.
4. The `keys` table (private key material) is never touched by reorg — it has no `blockNumber` and is not chain-derived.

##### Copies

Copies keep intent of the users. We should keep original dataset and piece data to be able to repair even the original copy. The only critical failure mode is original SP doesn't have the piece data anymore.
The finalization pipeline validates copies at finalized block depth to ensure replication is durable after reorgs or Foxer replay, and automatically re-replicates if target pieces disappear.

###### Copies constraints

- Each copy needs to go to a different Service Provider different from the Source Piece and from each other
- By default one extra copy should be created
- Piece metadata can include `{ mspCopies: [number of copies] }` to override the default

###### Copies Schema

```jsx
export const pieceCopyStatusEnum = pgEnum('piece_copy_status', [
  'pending',     // Intent created, waiting for grouping worker
  'processing',  // Replicate worker picked it up (pull + commit in-flight)
  'confirmed',   // On-chain tx confirmed
  'finalized',   // Target piece verified at finalized block depth
  'failed',      // Exhausted retries
  'orphaned',    // Source piece was removed (PiecesRemoved event)
])

export const pieceCopies = pgTable('pieceCopies', {
  id:                bigserial({ mode: 'bigint' }).primaryKey(),
  payer:             address().notNull(),
  sourceDatasetId:   bigint().notNull(),
  sourcePieceId:     bigint().notNull(),
  sourceProviderId:  bigint().notNull(),
  sourceBlockNumber: bigint().notNull(),
  targetProviderId:  bigint(),        // set by replicate worker
  targetDatasetId:   bigint(),        // set by replicate worker
  targetPieceId:     bigint(),        // set after commit confirms
  targetBlockNumber: bigint(),        // block where commit tx was included
  cid:               text().notNull(),
  size:              bigint(),
  status:            pieceCopyStatusEnum().notNull(),
  error:             text(),
  createdAt:         bigint().notNull(),
  updatedAt:         bigint(),
  finalizedAt:       bigint(),        // set when finalization verifies the copy
})
```

`cid` and `size` are denormalized from `pieces` intentionally — the copy row must survive source piece deletion. `targetBlockNumber` is extracted from the commit tx receipt and used by the finalization pipeline to determine when the commit block has reached finalized depth.

**Status lifecycle:**

```text
pending → processing → confirmed → finalized
                           ↓            ↓
                         failed      pending (target removed → re-replicate)
                           ↓
                        orphaned (source removed)
```

Three transitions during normal operation: `pending → processing` (grouping), `processing → confirmed` (replicate), `confirmed → finalized` (finalization). The finalization pipeline also handles reverse transitions: `finalized → pending` when the target piece disappears, and `confirmed/finalized → orphaned` when the source piece disappears.

**Constraints & indexes:**

| Constraint / Index | Columns | Purpose |
|---|---|---|
| `piece_copies_target_provider_not_source_check` | `targetProviderId <> sourceProviderId` (CHECK) | Prevents replicating to the same SP |
| `piece_copies_source_piece_target_provider_unique` | `(sourceDatasetId, sourcePieceId, targetProviderId)` (UNIQUE) | Prevents duplicate copies to the same target SP |
| `piece_copies_cid_index` | `cid` | Lookup by CID |
| `piece_copies_payer_index` | `payer` | Filter by payer |
| `piece_copies_source_piece_index` | `(sourceDatasetId, sourcePieceId)` | Lookup by source piece |
| `piece_copies_status_index` | `status` | Grouping worker filters by `pending` |
| `piece_copies_target_provider_id_index` | `targetProviderId` | Lookup by target provider |

###### Copies Flow

Two queues: Grouping (repeatable, polls every 30 s) and Replicate (persistent via bunqueue). The grouping worker also runs the finalization pipeline on each tick.

```text
┌───────────────────────┐
│  Foxer Indexer         │
│  storage:PieceAdded    │
│  (handle-pieces.ts)    │
└──────────┬────────────┘
           │ inserts piece row, then:
           │ if NOT msp-tagged AND active key exists
           ▼
┌───────────────────────┐
│  ensurePieceCopyIntent │  → INSERT pieceCopies (status: pending)
│                        │    or recycle orphaned row back to pending
└──────────┬────────────┘
           │
           ▼  (every 30 seconds)
┌───────────────────────┐
│  Grouping Worker       │  groupCopies():
│  (grouping.ts)         │  1. SELECT pending rows WHERE sourceBlockNumber ≤ finalized
│                        │     GROUP BY (payer, sourceProviderId), LIMIT MAX_BATCH_SIZE
│                        │     Filter: only groups with an active session key
│                        │  2. UPDATE matched rows → status: processing
│                        │  3. Enqueue one ReplicateQueue job per group
│                        │
│                        │  finalizeCopies():
│                        │  4. Pass 1: confirmed + target piece at finalized depth → finalized
│                        │  5. Pass 2: finalized + target piece gone → pending (re-replicate)
│                        │  6. Pass 3: confirmed + commit block finalized + target missing → pending
│                        │  7. Pass 4: confirmed/finalized + source piece gone → orphaned
└──────────┬────────────┘
           │
           ▼
┌───────────────────────┐
│  Replicate Worker      │  1. resolveGroupLocation(): pick target SP
│  (pipeline.ts)         │     (excludes sourceProviderId)
│                        │  2. Update targetProviderId + targetDatasetId
│                        │  3. signExtraData(): EIP-712 typed-data signature
│                        │  4. pullCopies(): SP.waitForPullStatus()
│                        │     (target SP fetches data from source SP)
│                        │  5. commitCopies(): on-chain addPieces / createDataSetAndAddPieces
│                        │  6. Update targetPieceId + targetBlockNumber from confirmed result
│                        │  7. updateCopiesStatus → confirmed
└───────────────────────┘
```

The grouping worker sets `processing` *before* enqueuing to prevent the next tick from re-selecting in-flight rows. The replicate worker handles the full lifecycle: resolve target → pull → commit → confirmed. On retry (up to 3 attempts with exponential backoff), the pull step is idempotent — `SP.waitForPullStatus` returns immediately if data is already at the target SP.

**Finalization pipeline:**

Runs as part of the grouping worker tick (every 30 s). All passes are batch SQL queries against the DB — no external calls. The `pieces` table (kept in sync by Foxer) is the source of truth for on-chain state. Four passes:

1. **Finalize** — `confirmed` copies whose target piece exists in `pieces` at finalized block depth (`pieces.blockNumber ≤ finalizedBlockNumber`) transition to `finalized`.
2. **Re-verify** — `finalized` copies whose target piece no longer exists in `pieces` (target SP dropped data or piece was removed) reset to `pending` with target fields cleared for re-replication to a different SP.
3. **Reorg detect** — `confirmed` copies where `targetBlockNumber ≤ finalizedBlockNumber` but the target piece doesn't exist in `pieces`. The commit block has reached finality — if the piece still isn't indexed, the commit was reorged away. Reset to `pending`.
4. **Orphan safety net** — `confirmed` or `finalized` copies whose source piece no longer exists in `pieces`. Set to `orphaned`. Catches timing edges where the `PiecesRemoved` handler didn't orphan the copy row.

**Deletion flow:**

When `pdpVerifier:PiecesRemoved` fires, matching `pieceCopies` rows are set to `orphaned` and `pieces` rows are deleted. If the same piece is later re-added (re-indexed), `ensurePieceCopyIntent` recycles the orphaned row back to `pending`.

**Startup recovery:**

On startup the replicate queue is obliterated (all bunqueue jobs cleared) and all `processing` rows are reset to `pending`. This makes the database the single source of truth — the grouping worker re-discovers and re-enqueues them naturally. This handles bunqueue SQLite corruption, crashes mid-flight, or any other state where a bunqueue job and DB row could get out of sync.

###### Future work

**1. `mspCopies` metadata override**

`{ mspCopies: N }` in piece metadata should override the default single copy. Currently `ensurePieceCopyIntent` always creates exactly one `pieceCopies` row and short-circuits if any non-orphaned copy already exists.

To support N > 1:

- `ensurePieceCopyIntent` reads `mspCopies` from the source piece's metadata and inserts N rows.
- `resolveGroupLocation` accepts a set of excluded provider IDs (sibling copy targets + source) so each copy goes to a different SP.
- The unique index `(sourceDatasetId, sourcePieceId, targetProviderId)` already handles dedup — multiple copies per piece are allowed as long as they target different providers.
- PostgreSQL treats NULLs as distinct in unique indexes so multiple pending rows (with NULL `targetProviderId`) won't conflict.
- When N > 1, sibling copies may end up in the same group. The replicate worker would need to call `resolveGroupLocation` with awareness of sibling copies.

**2. Source SP data unavailability**

This is the critical failure mode. Currently `pullCopies` fails and retries up to 3 times with no special handling. If the source SP returns 404, the copy ends up `failed`.

If other confirmed copies of the same piece exist (on different SPs), the replicate worker could fall back to pulling from one of those SPs instead of the source. This requires querying `pieceCopies` for sibling copies with `status = 'confirmed'` and using their `targetProviderId` as an alternative source.

**3. No funds**

Use costs api to check funds before replication

## API

### GET /copies

List copy intent records. At least one filter is required.

**Query params:** `payer` (hex address), `datasetId` (bigint), `status` (one of `pending`, `processing`, `confirmed`, `finalized`, `failed`, `orphaned`), `limit` (1–100, default 50), `offset` (default 0)

```json
{
  "items": [
    {
      "id": "1",
      "payer": "0x...",
      "sourceDatasetId": "1",
      "sourcePieceId": "0",
      "sourceProviderId": "2",
      "sourceBlockNumber": "12345",
      "targetProviderId": "3",
      "targetDatasetId": "5",
      "targetPieceId": "1",
      "cid": "baga...",
      "size": "1048576",
      "status": "confirmed",
      "error": null,
      "createdAt": "1711700000",
      "updatedAt": "1711700100"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

### POST /keys

Create a new server-managed session key pair and return its address.

```json
{
 "address": "0x..."
}
```

### GET /keys/:address

Return the stored key record for a specific address. Status, payer, and expiry are derived at query time by joining with `sessionKeys` and `sessionKeyPermissions`.

```json
{
 "address": "0x...",
 "payer": "0x..." | null,
 "privateKey": "0x...",
 "status": "pending" | "active" | "error" | "revoked",
 "expiresAt": "123" | null
}
```

`expiresAt` is the lowest expiry across the required permissions, stored as `numeric78` to support `uint256` values (including the max-uint infinite expiry used by the MSP CLI).

### GET /keys

Return all stored key records (with derived status).

```json
[
  {
    "address": "0x...",
    "payer": "0x..." | null,
    "privateKey": "0x...",
    "status": "pending" | "active" | "error" | "revoked",
    "expiresAt": "123" | null
  }
]
```

<!-- External Links -->
[FOC]: https://filecoin.cloud
[Foxer]: https://github.com/hugomrdias/foxer
[bunqueue]: https://bunqueue.dev/
[synapse-core]: https://github.com/FilOzone/synapse-sdk/tree/master/packages/synapse-core
