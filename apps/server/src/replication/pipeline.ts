import { Queue, Worker } from 'bunqueue/client'
import type { Address, Hex } from 'viem'
import type { Context } from '../../foxer.config.ts'
import {
  DEFAULT_JOB_OPTIONS,
  REPLICATION_QUEUE_DATA_PATH,
} from '../utils/constants.ts'
import {
  type CopiesGroup,
  commitCopies,
  pullCopies,
  resolveGroupLocation,
  signExtraData,
  updateCopiesStatus,
} from './actions.ts'

export interface CommitJobData extends CopiesGroup {
  extraData: Hex
  dataset?: {
    clientDataSetId: string
    dataSetId: bigint
  }
  provider: {
    serviceURL: string
    serviceProvider: Address
    payee: Address
  }
}

export const PullQueue = new Queue<CopiesGroup>('pull', {
  embedded: true,
  dataPath: REPLICATION_QUEUE_DATA_PATH,
})

export const CommitQueue = new Queue<CommitJobData>('commit', {
  embedded: true,
  dataPath: REPLICATION_QUEUE_DATA_PATH,
})

export function startPullWorker(context: Context) {
  PullQueue.purgeDlq()
  PullQueue.setDlqConfig({
    autoRetry: false,
    maxEntries: 2,
  })

  const worker = new Worker<CopiesGroup>(
    'pull',
    async (job) => {
      context.logger.info(
        { jobId: job.id, name: job.name },
        'Processing pull job'
      )
      await updateCopiesStatus({
        context,
        ids: job.data.copies.map((copy) => copy.id),
        status: 'uploading',
      })
      const location = await resolveGroupLocation({
        context,
        payer: job.data.payer,
        sourceProviderId: job.data.sourceProviderId,
      })

      await updateCopiesStatus({
        context,
        ids: job.data.copies.map((copy) => copy.id),
        status: 'uploading',
        targetProviderId: location.provider.id,
        targetDatasetId: location.dataset?.dataSetId,
      })

      const extraData = await signExtraData({
        context,
        location,
        group: job.data,
      })

      const response = await pullCopies({
        context,
        location,
        group: job.data,
        extraData,
      })

      if (response.status !== 'complete') {
        throw new Error(`Pull failed: ${response.status}`)
      }

      await CommitQueue.add(
        'commit',
        {
          ...job.data,
          extraData,
          provider: {
            serviceURL: location.provider.pdp.serviceURL,
            serviceProvider: location.provider.serviceProvider,
            payee: location.provider.payee,
          },
          dataset: location.dataset
            ? {
                clientDataSetId: location.dataset.clientDataSetId.toString(),
                dataSetId: location.dataset.dataSetId,
              }
            : undefined,
        },
        { ...DEFAULT_JOB_OPTIONS, timeout: 30_000 * 2 }
      )

      await updateCopiesStatus({
        context,
        ids: job.data.copies.map((copy) => copy.id),
        status: 'submitted',
      })

      return response
    },
    {
      embedded: true,
    }
  )

  worker.on('failed', async (job, error) => {
    context.logger.error({ jobId: job.id, error }, 'Pull job failed')
    if (job.attemptsMade >= DEFAULT_JOB_OPTIONS.attempts - 1) {
      await job.moveToFailed(error)
      await updateCopiesStatus({
        context,
        ids: job.data.copies.map((copy) => copy.id),
        status: 'failed',
        error: error.message,
      })
    }
  })

  return worker
}

export function startCommitWorker(context: Context) {
  const worker = new Worker<CommitJobData>(
    'commit',
    async (job) => {
      context.logger.info(
        { jobId: job.id, name: job.name },
        'Processing commit job'
      )

      const confirmed = await commitCopies({
        context,
        ...job.data,
      })

      await updateCopiesStatus({
        context,
        ids: job.data.copies.map((copy) => copy.id),
        status: 'confirmed',
      })

      return confirmed
    },
    {
      embedded: true,
    }
  )

  worker.on('failed', async (job, error) => {
    context.logger.error({ jobId: job.id, error }, 'Commit job failed')
    if (job.attemptsMade >= DEFAULT_JOB_OPTIONS.attempts - 1) {
      await job.moveToFailed(error)
      await updateCopiesStatus({
        context,
        ids: job.data.copies.map((copy) => copy.id),
        status: 'failed',
        error: error.message,
      })
    }
  })

  return worker
}
