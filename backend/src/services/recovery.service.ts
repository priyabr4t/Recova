import { CaseState, Prisma, type WebhookEvent } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { classifyQueue } from '../lib/queues.js'
import { audit } from './audit.service.js'

/**
 * Webhook ingestion → case creation. Idempotent at three layers:
 *  1. WebhookEvent.eventId unique (duplicate webhooks are skipped),
 *  2. processedAt claimed via conditional update (no double-ingest),
 *  3. one active case per invoice (a re-failure attaches to the existing case).
 */

const paymentFailedSchema = z.object({
  event: z.literal('payment.failed'),
  payload: z.object({
    payment: z.object({
      entity: z.object({
        id: z.string(),
        invoice_number: z.string(),
        amount: z.number().int().nonnegative(), // paise
        error_code: z.string().optional(),
        error_description: z.string().optional(),
        failed_at: z.string().optional(),
      }),
    }),
  }),
})

export async function ingestWebhookEvent(event: WebhookEvent): Promise<{ created: boolean; caseId?: string }> {
  const parsed = paymentFailedSchema.safeParse(event.payload)
  if (!parsed.success) {
    logger.warn({ eventId: event.eventId }, 'unparseable webhook payload — parked')
    return { created: false }
  }
  const p = parsed.data.payload.payment.entity

  const invoice = await prisma.invoice.findUnique({
    where: { invoiceNumber: p.invoice_number },
    include: { recoveryCase: true },
  })
  if (!invoice) {
    logger.warn({ invoiceNumber: p.invoice_number }, 'unknown invoice — parked')
    return { created: false }
  }

  const payment = await prisma.payment.create({
    data: {
      razorpayPaymentId: p.id,
      invoiceId: invoice.id,
      recoveryCaseId: invoice.recoveryCase?.id ?? null,
      attemptNo: (invoice.recoveryCase?.attemptCount ?? 0) + 1,
      amountPaise: BigInt(p.amount),
      status: 'FAILED',
      errorCode: p.error_code,
      errorDescription: p.error_description,
      failedAt: p.failed_at ? new Date(p.failed_at) : null,
    },
  })

  if (invoice.recoveryCase) {
    const existing = invoice.recoveryCase
    if (existing.state === 'RECOVERED' || existing.state === 'WRITTEN_OFF') {
      // Fresh failure after closure — new attempt evidence; reopen via new case
      // is out of demo scope, but never lose the audit trail:
      await audit(existing.id, 'SYSTEM', 'LATE_FAILURE_AFTER_CLOSURE', { paymentId: payment.id })
      return { created: false, caseId: existing.id }
    }
    // Re-failure while case open: record evidence, force a re-decision.
    await prisma.recoveryCase.update({
      where: { id: existing.id },
      data: { state: 'DECIDING' },
    })
    await audit(existing.id, 'SYSTEM', 'FAILURE_RECORDED', { paymentId: payment.id })
    await decisionRef(existing.id)
    return { created: false, caseId: existing.id }
  }

  const created = await prisma.recoveryCase.create({
    data: {
      caseNumber: `RCV-${invoice.invoiceNumber.replace('INV-', '')}`,
      customerId: invoice.customerId,
      invoiceId: invoice.id,
      state: 'DIAGNOSING',
      amountPaise: invoice.amountPaise,
    },
  })
  await prisma.payment.update({ where: { id: payment.id }, data: { recoveryCaseId: created.id } })
  await prisma.recoveryLedger.create({
    data: { recoveryCaseId: created.id, atRiskPaise: invoice.amountPaise },
  })
  await audit(created.id, 'SYSTEM', 'WEBHOOK_RECEIVED', { eventId: event.eventId })
  await audit(created.id, 'SYSTEM', 'CASE_CREATED', { invoiceNumber: invoice.invoiceNumber })
  await classifyQueue.add('classify', { caseId: created.id }, { jobId: `classify:${created.id}` })
  return { created: true, caseId: created.id }
}

async function decisionRef(caseId: string): Promise<void> {
  await classifyQueue.add('classify', { caseId }, { jobId: `classify:${caseId}:refail:${Date.now()}` })
}

/** Claims and ingests every pending webhook event. This is the demo's START RECOVERY button. */
export async function startBatch(): Promise<{ claimed: number; casesCreated: number }> {
  const pending = await prisma.webhookEvent.findMany({ where: { processedAt: null }, select: { id: true } })
  let claimed = 0
  let casesCreated = 0
  for (const { id } of pending) {
    const claim = await prisma.webhookEvent.updateMany({
      where: { id, processedAt: null },
      data: { processedAt: new Date() },
    })
    if (claim.count === 0) continue // someone else claimed it
    claimed++
    const event = await prisma.webhookEvent.findUnique({ where: { id } })
    if (!event) continue
    const res = await ingestWebhookEvent(event)
    if (res.created) casesCreated++
  }
  return { claimed, casesCreated }
}

export async function getCaseDetail(caseId: string) {
  return prisma.recoveryCase.findUnique({
    where: { id: caseId },
    include: {
      customer: true,
      invoice: true,
      payments: { orderBy: { attemptNo: 'asc' } },
      actions: { orderBy: { createdAt: 'asc' } },
      ledger: true,
      auditLogs: { orderBy: { createdAt: 'asc' } },
    },
  })
}

export async function listCases(filter: { state?: CaseState; limit?: number }) {
  return prisma.recoveryCase.findMany({
    where: filter.state ? { state: filter.state } : undefined,
    include: { customer: { select: { name: true } }, ledger: true },
    orderBy: { createdAt: 'desc' },
    take: Math.min(filter.limit ?? 50, 200),
  })
}

export type CaseDetail = NonNullable<Prisma.PromiseReturnType<typeof getCaseDetail>>
