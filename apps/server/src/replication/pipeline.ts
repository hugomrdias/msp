import { Queue, Worker } from 'bunqueue/client'
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
  updateCopyTargets,
} from './actions.ts'

export const ReplicateQueue = new Queue<CopiesGroup>('replicate', {
  embedded: true,
  dataPath: REPLICATION_QUEUE_DATA_PATH,
})

export function startReplicateWorker(context: Context) {
  ReplicateQueue.setDlqConfig({
    autoRetry: false,
    maxEntries: 100,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })

  const worker = new Worker<CopiesGroup>(
    'replicate',
    async (job) => {
      context.logger.info(
        { jobId: job.id, name: job.name },
        'Processing replicate job'
      )

      await job.updateProgress(10, 'Resolving target provider')
      const location = await resolveGroupLocation({
        context,
        payer: job.data.payer,
        sourceProviderId: job.data.sourceProviderId,
      })

      await updateCopiesStatus({
        context,
        ids: job.data.copies.map((copy) => copy.id),
        status: 'processing',
        targetProviderId: location.provider.id,
        targetDatasetId: location.dataset?.dataSetId,
      })

      await job.updateProgress(20, 'Signing extra data')
      const extraData = await signExtraData({
        context,
        location,
        group: job.data,
      })

      await job.updateProgress(30, 'Pulling pieces to target SP')
      const response = await pullCopies({
        context,
        location,
        group: job.data,
        extraData,
      })

      if (response.status !== 'complete') {
        throw new Error(`Pull failed: ${response.status}`)
      }

      await job.updateProgress(70, 'Committing on-chain')
      const result = await commitCopies({
        context,
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
      })

      await job.updateProgress(90, 'Updating copy records')
      await updateCopyTargets({
        context,
        copies: job.data.copies,
        pieceIds: result.pieceIds,
        dataSetId: result.dataSetId,
        blockNumber: result.blockNumber,
      })

      await updateCopiesStatus({
        context,
        ids: job.data.copies.map((copy) => copy.id),
        status: 'confirmed',
      })

      return result
    },
    {
      embedded: true,
      concurrency: 3,
      lockDuration: 600_000,
      heartbeatInterval: 15_000,
      maxStalledCount: 2,
    }
  )

  worker.on('failed', async (job, error) => {
    context.logger.error({ jobId: job.id, error }, 'Replicate job failed')
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

  worker.on('stalled', (jobId, reason) => {
    context.logger.warn({ jobId, reason }, 'Replicate job stalled')
  })

  return worker
}
