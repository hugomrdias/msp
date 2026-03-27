/** biome-ignore-all lint/suspicious/noConsole: cli */
import { shutdownManager } from 'bunqueue/client'
import { asyncExitHook } from 'exit-hook'
import type { Context } from '../../foxer.config.ts'
import { GroupingQueue, startGroupingWorker } from './grouping.ts'
import {
  CommitQueue,
  PullQueue,
  startCommitWorker,
  startPullWorker,
} from './pipeline.ts'

export async function startQueue(context: Context) {
  const workers = {
    grouping: await startGroupingWorker(context),
    pull: startPullWorker(context),
    commit: startCommitWorker(context),
  }
  const queues = {
    grouping: GroupingQueue,
    pull: PullQueue,
    commit: CommitQueue,
  }

  asyncExitHook(
    async () => {
      // 1. Stop accepting new jobs
      context.logger.warn('Pausing all workers...')
      for (const worker of Object.values(workers)) {
        worker.pause()
      }

      // 2. Wait for active jobs to complete (with timeout)
      context.logger.warn('Waiting for active jobs to complete...')

      try {
        await Promise.race([
          Promise.all(Object.values(workers).map((w) => w.close())),
        ])
        context.logger.warn('All workers closed gracefully')
      } catch {
        context.logger.error('Forcing worker shutdown...')
        await Promise.all(Object.values(workers).map((w) => w.close(true)))
      }

      // 3. Close queue connections
      context.logger.warn('Closing queue connections...')
      await Promise.all(Object.values(queues).map((q) => q.close()))

      // 4. Shutdown the embedded manager (flushes SQLite)
      shutdownManager()

      context.logger.warn('Shutdown queues completed')
    },
    {
      wait: 30_000, // 30 seconds
    }
  )

  return workers
}
