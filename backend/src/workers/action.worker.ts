import type { Job } from 'bullmq'
import { RecoveryActionType } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { audit } from '../services/audit.service.js'
import { getSimNow } from '../services/simclock.service.js'
import { retryPayment, simulateEmailOutcome } from '../services/razorpay-sim.service.js'
import { draftEmail } from '../services/llm.service.js'
import { rupees } from '../lib/money.js'
import { MAX_RETRIES, retryDelayHours } from '../services/rules.service.js'

/**
 * Execution stage. Every action row is claimed with a conditional update
 * (PENDING → EXECUTING) so concurrent workers can never double-execute; the
 * case state machine is moved with the same discipline. Terminal states:
 * RECOVERED | ESCALATED | WRITTEN_OFF — checked by /health/invariants.
 */
export async function processAction(job: Job<{ actionId: string }>): Promise<void> {
  const claimed = await prisma.recoveryAction.updateMany({
    where: { id: job.data.actionId, status: 'PENDING' },
    data: { status: 'EXECUTING' },
  })
  if (claimed.count === 0) return // already claimed/executed

  const action = await prisma.recoveryAction.findUniqueOrThrow({
    where: { id: job.data.actionId },
    include: { recoveryCase: { include: { customer: true, invoice: true } } },
  })
  const kase = action.recoveryCase
  const simNow = await getSimNow()

  try {
    switch (action.type) {
      case RecoveryActionType.RETRY_PAYMENT: {
        await prisma.recoveryLedger.update({
          where: { recoveryCaseId: kase.id },
          data: { attemptedPaise: { increment: kase.amountPaise } },
        })
        const result = retryPayment(kase.id, kase.attemptCount + 1, kase.cause)
        await prisma.payment.create({
          data: {
            razorpayPaymentId: result.providerPaymentId,
            invoiceId: kase.invoiceId,
            recoveryCaseId: kase.id,
            attemptNo: kase.attemptCount + 1,
            amountPaise: kase.amountPaise,
            status: result.success ? 'SUCCESS' : 'FAILED',
            errorCode: result.errorCode,
          },
        })
        await audit(kase.id, 'SYSTEM', 'PAYMENT_RETRY_EXECUTED', {
          attempt: kase.attemptCount + 1,
          success: result.success,
        })

        if (result.success) {
          await settle(kase.id, kase.invoiceId, kase.amountPaise)
          await prisma.recoveryAction.update({
            where: { id: action.id },
            data: { status: 'SUCCESS', executedAt: simNow, outcome: 'PAYMENT_RECOVERED' },
          })
          return
        }

        const nextAttempt = kase.attemptCount + 1
        const exhausted = nextAttempt >= MAX_RETRIES
        await prisma.recoveryAction.update({
          where: { id: action.id },
          data: { status: 'SUCCESS', executedAt: simNow, outcome: `RETRY_FAILED_${nextAttempt}` },
        })
        await prisma.recoveryCase.update({
          where: { id: kase.id },
          data: {
            attemptCount: nextAttempt,
            state: 'WAITING_SCHEDULE',
            nextActionAt: new Date(simNow.getTime() + (exhausted ? 1 : retryDelayHours(nextAttempt)) * 3600_000),
          },
        })
        if (exhausted) {
          await audit(kase.id, 'RULE_ENGINE', 'RETRY_LIMIT_REACHED', { maxRetries: MAX_RETRIES })
        }
        return
      }

      case RecoveryActionType.SEND_EMAIL: {
        const draft = await draftEmail({
          cause: kase.cause,
          customerName: kase.customer.name,
          amountPaise: kase.amountPaise,
          invoiceNumber: kase.invoice.invoiceNumber,
        })
        // Demo mode: email is rendered + audited, not actually sent.
        await audit(kase.id, 'SYSTEM', 'EMAIL_GENERATED', {
          to: kase.customer.email,
          subject: draft.subject,
          body: draft.body,
          generatedBy: draft.generatedBy,
        })
        const { recovered } = simulateEmailOutcome(kase.id, kase.cause)
        await prisma.recoveryAction.update({
          where: { id: action.id },
          data: {
            status: 'SUCCESS',
            executedAt: simNow,
            outcome: recovered ? 'CUSTOMER_PAID_AFTER_OUTREACH' : 'NO_RESPONSE',
          },
        })
        if (recovered) {
          await settle(kase.id, kase.invoiceId, kase.amountPaise)
          return
        }
        await prisma.recoveryCase.update({
          where: { id: kase.id },
          data: {
            contactCount: kase.contactCount + 1,
            state: 'WAITING_SCHEDULE',
            nextActionAt: new Date(simNow.getTime() + 48 * 3600_000), // follow-up decision in 2 days
          },
        })
        return
      }

      case RecoveryActionType.ESCALATE: {
        await prisma.recoveryCase.update({ where: { id: kase.id }, data: { state: 'ESCALATED' } })
        await prisma.recoveryAction.update({
          where: { id: action.id },
          data: { status: 'SUCCESS', executedAt: simNow, outcome: 'ESCALATED_TO_HUMAN' },
        })
        await audit(kase.id, 'SYSTEM', 'ESCALATED_TO_HUMAN', { reason: action.reason })
        return
      }

      case RecoveryActionType.NO_ACTION: {
        await prisma.recoveryCase.update({ where: { id: kase.id }, data: { state: 'WRITTEN_OFF' } })
        await prisma.invoice.update({ where: { id: kase.invoiceId }, data: { status: 'WRITTEN_OFF' } })
        await prisma.recoveryAction.update({
          where: { id: action.id },
          data: { status: 'SUCCESS', executedAt: simNow, outcome: 'NO_ACTION_APPROPRIATE' },
        })
        await audit(kase.id, 'SYSTEM', 'CASE_WRITTEN_OFF', { reason: action.reason })
        return
      }
    }
  } catch (err) {
    // Failure handled gracefully: park the action as FAILED, return the case to
    // the sweeper's world so it is re-decided rather than silently vanishing.
    logger.error({ err: String(err), actionId: action.id }, 'action execution failed')
    await prisma.recoveryAction.update({
      where: { id: action.id },
      data: { status: 'FAILED', error: String(err).slice(0, 500) },
    })
    await prisma.recoveryCase.update({
      where: { id: kase.id },
      data: { state: 'WAITING_SCHEDULE', nextActionAt: new Date(simNow.getTime() + 3600_000) },
    })
    await audit(kase.id, 'SYSTEM', 'ACTION_FAILED_PARKED', { actionId: action.id })
  }
}

async function settle(caseId: string, invoiceId: string, amountPaise: bigint): Promise<void> {
  await prisma.recoveryCase.update({ where: { id: caseId }, data: { state: 'RECOVERED' } })
  await prisma.invoice.update({ where: { id: invoiceId }, data: { status: 'PAID' } })
  await prisma.recoveryLedger.update({
    where: { recoveryCaseId: caseId },
    data: { recoveredPaise: { increment: amountPaise } },
  })
  await audit(caseId, 'SYSTEM', 'PAYMENT_RECOVERED', { amount: rupees(amountPaise) })
}
