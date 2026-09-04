import { Queue } from 'bullmq'
import { connection } from './redis.js'

// Three pipeline stages. Jobs are lightweight ({caseId}/{actionId}) — the DB
// is always the source of truth; a lost job is recoverable by the sweeper.
export const QUEUES = {
  classify: 'classify',
  decision: 'decision',
  action: 'action',
} as const

export const classifyQueue = new Queue(QUEUES.classify, { connection })
export const decisionQueue = new Queue(QUEUES.decision, { connection })
export const actionQueue = new Queue(QUEUES.action, { connection })
