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

### Reorg - what happens?

Copies keep intent of the users. We should keep original dataset and piece data to be able to repair even the original copy. The only critical failure mode is original SP doesn't have the piece data anymore.
Replication should have a pipeline to validate copies at finalized depth to make sure replication is durable after reorg.

### Not enough funds - what happens?

TODO

### Copies constraints

- Each copy needs to go to a different Service Provider different from the Source Piece and from each other
- By default one extra copy should be created
- Piece metadata can include `{ mspCopies: [number of copies] }` to override the default

## API

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
