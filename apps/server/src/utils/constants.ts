import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { JobOptions } from 'bunqueue/client'
import {
  MSP_METADATA_KEY,
  MSP_METADATA_VALUE,
} from '../replication/metadata.ts'

function queueDataPath() {
  const path =
    process.env.MSP_BUNQUEUE_PATH ??
    fileURLToPath(
      new URL('../../.bunqueue/replication.sqlite', import.meta.url)
    )

  mkdirSync(dirname(path), { recursive: true })

  return path
}

export const REPLICATION_QUEUE_DATA_PATH = queueDataPath()
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000 },
  timeout: 900_000,
} satisfies JobOptions

export const MAX_BATCH_SIZE = 50

export const MSP_METADATA = {
  [MSP_METADATA_KEY]: MSP_METADATA_VALUE,
}
