/** biome-ignore-all lint/suspicious/noConsole: cli */
import { shutdownManager } from 'bunqueue/client'
import { eq } from 'drizzle-orm'
import { asyncExitHook } from 'exit-hook'
import type { Context } from '../../foxer.config.ts'
import { schema } from '../schema/index.ts'
import { nowInSecondsBigint } from '../utils/time.ts'
import { GroupingQueue, startGroupingWorker } from './grouping.ts'
import { ReplicateQueue, startReplicateWorker } from './pipeline.ts'

export async function startQueue(context: Context) {
  ReplicateQueue.obliterate()

  const resetResult = await context.db
    .update(schema.pieceCopies)
    .set({
      status: 'pending',
      error: null,
      updatedAt: nowInSecondsBigint(),
    })
    .where(eq(schema.pieceCopies.status, 'processing'))
    .returning({ id: schema.pieceCopies.id })

  if (resetResult.length > 0) {
    context.logger.warn(
      { count: resetResult.length },
      'Reset processing copies back to pending on startup'
    )
  }

  const workers = {
    grouping: await startGroupingWorker(context),
    replicate: startReplicateWorker(context),
  }
  const queues = {
    grouping: GroupingQueue,
    replicate: ReplicateQueue,
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
        await Promise.all(Object.values(workers).map((w) => w.close()))
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
      wait: 120_000,
    }
  )

  return workers
}
