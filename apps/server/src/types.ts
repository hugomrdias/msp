import type { PullPieceInput } from '@filoz/synapse-core/sp'
import type { Address, Hex } from 'viem'

/**
 * Base options for pulling pieces.
 * TODO this is not exported by Synapse Core, so we need to define it here.
 */
export type BasePullPiecesOptions = {
  /** The service URL of the PDP API. */
  serviceURL: string
  /** Pieces to pull with their source URLs. */
  pieces: PullPieceInput[]
  /** Optional nonce for the add pieces signature. Ignored when extraData is provided. */
  nonce?: bigint
  /** The address of the record keeper. If not provided, the default is the Warm Storage contract address. */
  recordKeeper?: Address
  /** Optional AbortSignal to cancel the request. */
  signal?: AbortSignal
  /** Pre-built signed extraData. When provided, skips internal EIP-712 signing. */
  extraData?: Hex
}
