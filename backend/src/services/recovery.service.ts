import { CaseState, Prisma, type WebhookEvent } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { classifyQueue } from '../lib/queues.js'
import { audit } from './audit.service.js'

/**
 * Webhook ingestion → case creation. Idempotent at three layers:
 *  1. WebhookEvent (orgId, eventId) unique (duplicate webhooks are skipped),
 *  2. processedAt claimed via conditional update (no double-ingest),
 *  3. one active case per invoice (a re-failure attaches to the existing case).
 * Every query is scoped by event.orgId — webhooks carry their org's API key.
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
  const orgId = event.orgId
  const p = parsed.data.payload.payment.entity

  const invoice = await prisma.invoice.findFirst({
    where: { orgId, invoiceNumber: p.invoice_number },
    include: { recoveryCase: true },
  })
  if (!invoice) {
    logger.warn({ invoiceNumber: p.invoice_number }, 'unknown invoice — parked')
    return { created: false }
  }

  // Upsert, not create: the seeded batch already carries attempt-1 Payment rows,
  // and a replayed webhook must never violate the payment unique key.
  const payment = await prisma.payment.upsert({
    where: { orgId_razorpayPaymentId: { orgId, razorpayPaymentId: p.id } },
    create: {
      orgId,
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
    update: {
      invoiceId: invoice.id,
      recoveryCaseId: invoice.recoveryCase?.id ?? null,
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
      await audit(orgId, existing.id, 'SYSTEM', 'LATE_FAILURE_AFTER_CLOSURE', { paymentId: payment.id })
      return { created: false, caseId: existing.id }
    }
    // Re-failure while case open: record evidence, force a re-decision.
    await prisma.recoveryCase.update({
      where: { id: existing.id },
      data: { state: 'DECIDING' },
    })
    await audit(orgId, existing.id, 'SYSTEM', 'FAILURE_RECORDED', { paymentId: payment.id })
    await decisionRef(existing.id)
    return { created: false, caseId: existing.id }
  }

  const created = await prisma.recoveryCase.create({
    data: {
      orgId,
      caseNumber: `RCV-${invoice.invoiceNumber.replace('INV-', '')}`,
      customerId: invoice.customerId,
      invoiceId: invoice.id,
      state: 'DIAGNOSING',
      amountPaise: invoice.amountPaise,
    },
  })
  await prisma.payment.update({ where: { id: payment.id }, data: { recoveryCaseId: created.id } })
  await prisma.recoveryLedger.create({
    data: { orgId, recoveryCaseId: created.id, atRiskPaise: invoice.amountPaise },
  })
  await audit(orgId, created.id, 'SYSTEM', 'WEBHOOK_RECEIVED', { eventId: event.eventId })
  await audit(orgId, created.id, 'SYSTEM', 'CASE_CREATED', { invoiceNumber: invoice.invoiceNumber })
  await classifyQueue.add('classify', { caseId: created.id }, { jobId: `classify-${created.id}` })
  return { created: true, caseId: created.id }
}

async function decisionRef(caseId: string): Promise<void> {
  await classifyQueue.add('classify', { caseId }, { jobId: `classify-${caseId}-refail-${Date.now()}` })
}

/** Claims and ingests pending webhook events for this org, up to maxCases (plan limit). This is START RECOVERY. */
export async function startBatch(orgId: string, maxCases?: number): Promise<{ claimed: number; casesCreated: number }> {
  const pending = await prisma.webhookEvent.findMany({
    where: { orgId, processedAt: null },
    select: { id: true },
    take: maxCases !== undefined ? Math.max(maxCases, 0) : undefined,
  })
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

export async function getCaseDetail(orgId: string, caseId: string) {
  // Accepts either the Prisma id or the human case number (e.g. RCV-1003) —
  // dashboard links use case numbers.
  return prisma.recoveryCase.findFirst({
    where: { orgId, OR: [{ id: caseId }, { caseNumber: caseId }] },
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

export async function listCases(orgId: string, filter: { state?: CaseState; limit?: number }) {
  return prisma.recoveryCase.findMany({
    where: { orgId, ...(filter.state ? { state: filter.state } : {}) },
    include: { customer: { select: { name: true } }, ledger: true },
    orderBy: { createdAt: 'desc' },
    take: Math.min(filter.limit ?? 50, 200),
  })
}

// ---------- human overrides ----------
// HUMAN-actor entries. The agent never runs these — a person does, and the
// audit trail says so. Deterministic code enforces "non-terminal only".

async function loadOpenCase(orgId: string, caseId: string) {
  return prisma.recoveryCase.findFirst({
    where: { orgId, OR: [{ id: caseId }, { caseNumber: caseId }] },
  })
}

export async function addHumanNote(orgId: string, caseId: string, body: string) {
  const kase = await loadOpenCase(orgId, caseId)
  if (!kase) return null
  await audit(orgId, kase.id, 'HUMAN', 'HUMAN_NOTE', { note: body.slice(0, 2000) })
  return kase.id
}

export async function humanEscalate(orgId: string, caseId: string, reason: string) {
  const kase = await loadOpenCase(orgId, caseId)
  if (!kase || ['RECOVERED', 'ESCALATED', 'WRITTEN_OFF'].includes(kase.state)) return null
  await prisma.recoveryCase.update({ where: { id: kase.id }, data: { state: 'ESCALATED' } })
  await audit(orgId, kase.id, 'HUMAN', 'HUMAN_ESCALATED', { reason: reason.slice(0, 500) })
  return kase.id
}

export async function humanWriteOff(orgId: string, caseId: string, reason: string) {
  const kase = await loadOpenCase(orgId, caseId)
  if (!kase || ['RECOVERED', 'ESCALATED', 'WRITTEN_OFF'].includes(kase.state)) return null
  await prisma.recoveryCase.update({ where: { id: kase.id }, data: { state: 'WRITTEN_OFF' } })
  await prisma.invoice.update({ where: { id: kase.invoiceId }, data: { status: 'WRITTEN_OFF' } })
  await audit(orgId, kase.id, 'HUMAN', 'HUMAN_WRITE_OFF', { reason: reason.slice(0, 500) })
  return kase.id
}

/** Re-run the decide stage under human supervision (e.g. after fixing data). */
export async function humanRedecide(orgId: string, caseId: string, reason: string) {
  const kase = await loadOpenCase(orgId, caseId)
  if (!kase || ['RECOVERED', 'ESCALATED', 'WRITTEN_OFF'].includes(kase.state)) return null
  await prisma.recoveryCase.update({ where: { id: kase.id }, data: { state: 'DECIDING' } })
  await audit(orgId, kase.id, 'HUMAN', 'HUMAN_RE_DECIDE', { reason: reason.slice(0, 500) })
  await classifyQueue.add('classify', { caseId: kase.id }, { jobId: `classify-${kase.id}-redecide-${Date.now()}` })
  return kase.id
}

// ---------- audit feed ----------

export async function listAudit(
  orgId: string,
  filter: { actor?: string; q?: string; limit?: number },
) {
  const where: Prisma.AuditLogWhereInput = { orgId }
  if (filter.actor) where.actor = filter.actor as Prisma.EnumActorTypeFilter['equals']
  if (filter.q) where.OR = [{ event: { contains: filter.q, mode: 'insensitive' } }]
  return prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: Math.min(filter.limit ?? 100, 500),
    include: { recoveryCase: { select: { caseNumber: true } } },
  })
}

export type CaseDetail = NonNullable<Prisma.PromiseReturnType<typeof getCaseDetail>>
