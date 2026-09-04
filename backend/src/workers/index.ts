import { Worker } from 'bullmq'
import { connection } from '../lib/redis.js'
import { QUEUES } from '../lib/queues.js'
import { logger } from '../lib/logger.js'
import { startSweeper } from './sweeper.worker.js'
import { processClassify } from './classify.worker.js'
import { processDecision } from './decision.worker.js'
import { processAction } from './action.worker.js'

// One set of workers co-resident with the API process. Enough for the demo;
// scale-out later is just running more consumers with the same queue names.

export function startWorkers(): () => Promise<void> {
  const workers = [
    new Worker(QUEUES.classify, (job) => processClassify(job as never), { connection }),
    new Worker(QUEUES.decision, (job) => processDecision(job as never), { connection }),
    new Worker(QUEUES.action, (job) => processAction(job as never), { connection }),
  ]

  const sweeperTimer = startSweeper()
  logger.info('recova workers started (classify, decision, action, sweeper)')

  return async () => {
    logger.info('shutting down workers')
    clearInterval(sweeperTimer)
    await Promise.all(workers.map((w) => w.close()))
  }
}
