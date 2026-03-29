import { Queue, Worker } from 'bunqueue/client'
import type { Context } from '../../foxer.config.ts'
import {
  DEFAULT_JOB_OPTIONS,
  REPLICATION_QUEUE_DATA_PATH,
} from '../utils/constants.ts'
import { groupCopies } from './actions.ts'
import { ReplicateQueue } from './pipeline.ts'

export const GroupingQueue = new Queue('grouping', {
  embedded: true,
  dataPath: REPLICATION_QUEUE_DATA_PATH,
})

export async function startGroupingWorker(context: Context) {
  await GroupingQueue.add(
    'grouping',
    {},
    {
      removeOnComplete: true,
      removeOnFail: true,
      attempts: 1,
      repeat: {
        every: 30_000, // 30 seconds
      },
    }
  )

  const worker = new Worker(
    'grouping',
    async () => {
      const groups = await groupCopies(context)

      for (const group of groups) {
        await ReplicateQueue.add('replicate', group, DEFAULT_JOB_OPTIONS)
      }

      return { count: groups.length }
    },
    {
      embedded: true,
    }
  )

  worker.on('completed', (job) => {
    context.logger.info({ jobId: job.id }, 'Grouping job completed')
  })

  worker.on('failed', (job, error) => {
    context.logger.error({ jobId: job.id, error }, 'Grouping job failed')
  })

  return worker
}
