import type { Job } from 'bullmq'
import { RecoveryActionType, type Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { actionQueue } from '../lib/queues.js'
import {
  allowedActions,
  fallbackAction,
  isAllowed,
  nextContactableTime,
  retryDelayHours,
  type AllowedAction,
  type RecoveryContext,
} from '../services/rules.service.js'
import { decideAction } from '../services/llm.service.js'
import { audit } from '../services/audit.service.js'
import { getSimNow } from '../services/simclock.service.js'

/**
 * Decision stage: rules engine computes the allowed set; the LLM picks within
 * it. If the LLM is down or suggests something outside the set, we record a
 * BLOCKED action row (audit evidence of the veto) and execute the
 * deterministic fallback. A case never stalls because the model misbehaved.
 */
export async function processDecision(job: Job<{ caseId: string }>): Promise<void> {
  const { caseId } = job.data
  const kase = await prisma.recoveryCase.findUnique({
    where: { id: caseId },
    include: {
      customer: true,
      invoice: true,
      payments: { where: { status: 'SUCCESS' } },
    },
  })
  if (!kase || kase.state !== 'DECIDING') return

  const simNow = await getSimNow()

  // A scheduled action that is now due must EXECUTE, not be re-decided —
  // otherwise the retry backoff ladder dead-loops (the sweeper would wake the
  // case, a fresh retry would be scheduled, attemptCount never moves). This
  // covers both backoff retries and quiet-hours-deferred outreach.
  const dueAction = await prisma.recoveryAction.findFirst({
    where: {
      recoveryCaseId: caseId,
      status: 'PENDING',
      scheduledFor: { lte: simNow },
    },
    orderBy: { createdAt: 'asc' },
  })
  if (dueAction) {
    await prisma.recoveryCase.update({ where: { id: caseId }, data: { state: 'ACTING' } })
    await actionQueue.add('action', { actionId: dueAction.id }, { jobId: `action-${dueAction.id}`, removeOnComplete: true })
    return
  }

  const ctx: RecoveryContext = {
    attemptCount: kase.attemptCount,
    contactCount: kase.contactCount,
    optedOut: kase.customer.optedOut,
    harassmentCount: kase.customer.harassmentCount,
    cause: kase.cause,
    amountPaise: kase.amountPaise,
  }
  const allowed = allowedActions(ctx)

  const llmDecision = await decideAction(
    {
      cause: kase.cause,
      amountPaise: kase.amountPaise,
      attemptCount: kase.attemptCount,
      contactCount: kase.contactCount,
      priorSuccessfulPayments: kase.payments.length,
    },
    allowed,
  )

  let finalAction: AllowedAction
  let reason: string
  let confidence: number
  let blockedRow: { action: AllowedAction; reason: string } | null = null

  if (llmDecision && isAllowed(llmDecision.action as AllowedAction, allowed)) {
    finalAction = llmDecision.action as AllowedAction
    reason = llmDecision.reason
    confidence = llmDecision.confidence
  } else if (llmDecision) {
    // LLM suggested something the rules engine forbids → record the veto.
    blockedRow = { action: llmDecision.action as AllowedAction, reason: llmDecision.reason }
    finalAction = fallbackAction(ctx, allowed)
    reason = `LLM suggested ${llmDecision.action}, blocked by rules engine; fallback: ${finalAction}`
    confidence = 0
  } else {
    finalAction = fallbackAction(ctx, allowed)
    reason = llmDecision === null
      ? `Deterministic fallback policy (LLM unavailable)`
      : `Deterministic fallback policy (LLM suggested blocked action)`
    confidence = 0
  }

  const ruleDecisionJson: Prisma.InputJsonValue = { allowed, blockedSuggestion: blockedRow }
  const llmDecisionJson: Prisma.InputJsonValue | undefined = llmDecision
    ? { action: llmDecision.action, reason: llmDecision.reason, confidence: llmDecision.confidence }
    : undefined

  // The veto itself is a judge-visible metric: a BLOCKED action row that is
  // never executed, kept so the dashboard's "rule blocks" count is real.
  if (blockedRow && (Object.values(RecoveryActionType) as string[]).includes(blockedRow.action)) {
    await prisma.recoveryAction.create({
      data: {
        orgId: kase.orgId,
        recoveryCaseId: caseId,
        type: blockedRow.action as RecoveryActionType,
        status: 'BLOCKED',
        reason: `Rule veto: ${blockedRow.action} not in allowed set`,
        confidence: llmDecision?.confidence ?? 0,
        ruleDecision: ruleDecisionJson,
        llmDecision: llmDecisionJson,
      },
    })
  }

  const action = await prisma.recoveryAction.create({
    data: {
      orgId: kase.orgId,
      recoveryCaseId: caseId,
      type: RecoveryActionType[finalAction],
      status: 'PENDING',
      reason,
      confidence,
      ruleDecision: ruleDecisionJson,
      llmDecision: llmDecisionJson,
    },
  })

  await audit(kase.orgId, caseId, 'RULE_ENGINE', 'RULES_CHECKED', ruleDecisionJson)
  await audit(
    kase.orgId,
    caseId,
    llmDecision ? 'LLM' : 'SYSTEM',
    blockedRow ? 'DECISION_BLOCKED_BY_RULES' : 'DECISION_GENERATED',
    { action: finalAction, reason, confidence },
  )

  // Quiet hours (22:00–08:00 IST): outreach is deferred to the next contactable
  if (finalAction === 'SEND_EMAIL') {
    const contactableAt = nextContactableTime(simNow)
    if (contactableAt > simNow) {
      await prisma.recoveryAction.update({
        where: { id: action.id },
        data: { scheduledFor: contactableAt },
      })
      await prisma.recoveryCase.update({
        where: { id: caseId },
        data: { state: 'WAITING_SCHEDULE', nextActionAt: contactableAt },
      })
      await audit(kase.orgId, caseId, 'RULE_ENGINE', 'QUIET_HOURS_DEFERRED', {
        resumesAt: contactableAt.toISOString(),
      })
      return
    }
  }

  // Schedule: retries follow the backoff ladder; everything else executes now.
  if (finalAction === 'RETRY_PAYMENT') {
    const delayH = retryDelayHours(kase.attemptCount)
    const scheduledFor = new Date(simNow.getTime() + delayH * 3600_000)
    if (delayH > 0) {
      await prisma.recoveryAction.update({ where: { id: action.id }, data: { scheduledFor } })
    }
    await prisma.recoveryCase.update({
      where: { id: caseId },
      data: { state: delayH === 0 ? 'ACTING' : 'WAITING_SCHEDULE', nextActionAt: scheduledFor },
    })
    if (delayH === 0) {
      await actionQueue.add('action', { actionId: action.id }, { jobId: `action-${action.id}`, removeOnComplete: true })
    }
  } else {
    await prisma.recoveryCase.update({ where: { id: caseId }, data: { state: 'ACTING' } })
    await actionQueue.add('action', { actionId: action.id }, { jobId: `action-${action.id}`, removeOnComplete: true })
  }
}
