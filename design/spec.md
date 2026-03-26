# Spec

## Whats is Myelin

Myelin is a background replication service for [Filecoin Onchain Cloud][FOC]. It manages Session Keys approved by the users in the Session Key Registry contract and uses those to replicate uploads (Pieces) to different Service Providers registered in the Service Provider Registry contract. When the user wants to enable replication, he request a key address from Myelin and approves it, after that all uploads are replicated. Replication options are managed by the user using the Piece metadata by default Myelin create one extra copy.

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

## Myelin Components

### Server

Myelin server uses [Foxer][Foxer] for indexing the Filecoin chain, HTTP api, database schema and migrations. Using indexing functions Myelin keeps track of the session keys approved or revoked by the user, and pieces and datasets created by users with Myelin session keys.
Replication is done using [bunqueue][bunqueue] to have a persistent embeded queue system to keep track of all the replication jobs.
Onchain operation are all done with [`@filoz/synape-core`][synapse-core].

The server indexes Datasets, Pieces, Service Providers and Session Keys from the chain itself, this is the primary source of truth for the replication pipeline.

For its own internal logical server keeps track of its own session keys, the copies its creating in the replication pipeline.

Datasets and Pieces created by Myelin server are marked with a tag in the metadata `{ myelin: 1 }` these maybe be deduped from the main onchain indexing tables to keep the READ api endpoints cleaner without the replication datasets and pieces. Another option is to have a "is_copy" column to filter directly from the main database table.

### Reorg - what happens?

Copies keep intent of the users. We should keep original dataset and piece data to be able to repair even the original copy. The only critical failure mode is original SP doesn't have the piece data anymore.
Replication should have a pipeline to validate copies at finalized depth to make sure replication is durable after reorg.

### Not enough funds - what happens?

TODO

### Copies Constrains

- Each copy needs to go to a different Service Provider different from the Source Piece and from each other
- By default one extra copy should be created
- Piece metadata can include `{ myelinCopies: [number of copies] }` to override the default

## API

### GET /request-key

Request address from a server session key pair

```json
{
 "address": "0x..."
}
```

## Schema

Session Key Pairs

```jsx
export const statusEnum = pgEnum('status', [
  'pending', // waiting contract login by the user
  'active', // registered and with proper permissions
  'error', // no proper permissions 
  'revoked', // has permissions but are expired
])
export const keys = pgTable(
  'keys',
  {
    address: address().notNull().primaryKey(),
    owner: address(),
    privateKey: hash().notNull(),
    status: statusEnum().notNull(),
    error: text(),
    expiresAt: bigint().notNull(), // the lowest of the required permissions
  }
)
```
<!-- External Links -->
[FOC]: https://filecoin.cloud
[FOC Docs]: https://docs.filecoin.cloud
[Foxer]: https://github.com/hugomrdias/foxer
[bunqueue]: https://bunqueue.dev/
[synapse-core]: https://github.com/FilOzone/synapse-sdk/tree/master/packages/synapse-core