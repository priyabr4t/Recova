import type { Job } from 'bullmq'
import { prisma } from '../lib/prisma.js'
import { decisionQueue } from '../lib/queues.js'
import { preClassify } from '../services/classify.service.js'
import { classifyAmbiguous } from '../services/llm.service.js'
import { audit } from '../services/audit.service.js'

export async function processClassify(job: Job<{ caseId: string }>): Promise<void> {
  const { caseId } = job.data
  const kase = await prisma.recoveryCase.findUnique({
    where: { id: caseId },
    include: {
      invoice: true,
      payments: { orderBy: { attemptNo: 'desc' }, take: 1 },
    },
  })
  if (!kase || kase.state !== 'DIAGNOSING') return // already handled elsewhere

  const lastFailure = kase.payments[0]
  // Layer 1: deterministic error-code table (fast, free, offline-safe).
  const ruleCause = preClassify(lastFailure?.errorCode)
  let cause = ruleCause
  let source: 'RULE_TABLE' | 'LLM' | 'FALLBACK' = 'RULE_TABLE'
  let confidence = ruleCause ? 0.99 : 0

  // Layer 2: LLM only for codes the table can't resolve.
  if (!cause) {
    const llmCause = await classifyAmbiguous({
      errorCode: lastFailure?.errorCode,
      errorDescription: lastFailure?.errorDescription,
      amountPaise: kase.amountPaise,
    })
    if (llmCause) {
      cause = llmCause.cause
      source = 'LLM'
      confidence = llmCause.confidence
    } else {
      // Layer 3: conservative default — outreach-only, never an auto-retry.
      cause = 'UNKNOWN'
      source = 'FALLBACK'
      confidence = 0
    }
  }

  await prisma.recoveryCase.update({
    where: { id: caseId },
    data: { cause, causeSource: source, causeConfidence: confidence, state: 'DECIDING' },
  })
  await audit(kase.orgId, caseId, source === 'LLM' ? 'LLM' : 'SYSTEM', 'FAILURE_CLASSIFIED', { cause, source, confidence })

  await decisionQueue.add('decision', { caseId }, { jobId: `decision-${caseId}-${Date.now()}`, removeOnComplete: true })
}
