import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { JobOptions } from 'bunqueue/client'
import {
  MYELIN_METADATA_KEY,
  MYELIN_METADATA_VALUE,
} from '../replication/metadata.ts'

function queueDataPath() {
  const path =
    process.env.MYELIN_BUNQUEUE_PATH ??
    fileURLToPath(
      new URL('../../.bunqueue/replication.sqlite', import.meta.url)
    )

  mkdirSync(dirname(path), { recursive: true })

  return path
}

export const REPLICATION_QUEUE_DATA_PATH = queueDataPath()
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2_000 },
} satisfies JobOptions

export const MYELIN_METADATA = {
  [MYELIN_METADATA_KEY]: MYELIN_METADATA_VALUE,
}
