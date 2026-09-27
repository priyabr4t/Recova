import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import type { CaseState } from '@prisma/client'
import {
  getCaseDetail,
  listCases,
  startBatch,
  addHumanNote,
  humanEscalate,
  humanWriteOff,
  humanRedecide,
  listAudit,
} from '../services/recovery.service.js'
import { buildAuditCsv } from '../services/audit.service.js'
import { requireAuth } from '../lib/auth.js'
import { monthStart, planFor } from '../lib/plans.js'
import { audit } from '../services/audit.service.js'

export const recoveryRouter = Router()

recoveryRouter.use(requireAuth)

/**
 * START RECOVERY, with the plan limit enforced deterministically: at most
 * `casesPerMonth` cases are automated per calendar month. Over-limit webhook
 * events stay parked (processedAt null) — data is never lost, automation just
 * stops. 402 tells the UI to show the plan upsell.
 */
recoveryRouter.post('/start', async (req, res) => {
  const orgId = req.auth!.orgId
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } })
  const limits = planFor(org.plan)
  const used = await prisma.recoveryCase.count({
    where: { orgId, createdAt: { gte: monthStart() } },
  })
  const remaining = limits.casesPerMonth - used
  if (remaining <= 0) {
    await audit(orgId, null, 'SYSTEM', 'USAGE_LIMIT_BLOCKED', { plan: org.plan, used })
    res.status(402).json({
      error: `Monthly plan limit reached (${limits.casesPerMonth} cases on ${limits.label}). Upgrade to keep recovering.`,
      plan: org.plan,
      limits: { casesPerMonth: limits.casesPerMonth },
      used,
    })
    return
  }
  const result = await startBatch(orgId, remaining)
  if (result.claimed > remaining) {
    await audit(orgId, null, 'SYSTEM', 'USAGE_LIMIT_PARTIAL', { allowed: remaining })
  }
  res.json(result)
})

recoveryRouter.get('/cases', async (req, res) => {
  const state = req.query.state as CaseState | undefined
  const limit = req.query.limit ? Number(req.query.limit) : undefined
  res.json(await listCases(req.auth!.orgId, { state, limit }))
})

recoveryRouter.get('/audit/export', async (req, res) => {
  const csv = await buildAuditCsv(req.auth!.orgId)
  res.setHeader('content-type', 'text/csv; charset=utf-8')
  res.setHeader('content-disposition', 'attachment; filename="recova-audit-log.csv"')
  res.send(csv)
})

recoveryRouter.get('/audit', async (req, res) => {
  const actor = req.query.actor as string | undefined
  const q = req.query.q as string | undefined
  const limit = req.query.limit ? Number(req.query.limit) : undefined
  res.json(await listAudit(req.auth!.orgId, { actor, q, limit }))
})

recoveryRouter.get('/cases/:id', async (req, res) => {
  const detail = await getCaseDetail(req.auth!.orgId, req.params.id ?? '')
  if (!detail) {
    res.status(404).json({ error: 'case not found' })
    return
  }
  res.json(detail)
})

// ---------- human overrides (HUMAN actor in the audit trail) ----------

const reasonSchema = z.object({ reason: z.string().min(1).max(500) })

recoveryRouter.post('/cases/:id/notes', async (req, res) => {
  const parsed = z.object({ body: z.string().min(1).max(2000) }).safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'note body required' })
    return
  }
  const id = await addHumanNote(req.auth!.orgId, req.params.id ?? '', parsed.data.body)
  if (!id) {
    res.status(404).json({ error: 'case not found' })
    return
  }
  res.json({ ok: true })
})

recoveryRouter.post('/cases/:id/escalate', async (req, res) => {
  const parsed = reasonSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'reason required' })
    return
  }
  const id = await humanEscalate(req.auth!.orgId, req.params.id ?? '', parsed.data.reason)
  if (!id) {
    res.status(400).json({ error: 'case not found or already terminal' })
    return
  }
  res.json({ ok: true })
})

recoveryRouter.post('/cases/:id/write-off', async (req, res) => {
  const parsed = reasonSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'reason required' })
    return
  }
  const id = await humanWriteOff(req.auth!.orgId, req.params.id ?? '', parsed.data.reason)
  if (!id) {
    res.status(400).json({ error: 'case not found or already terminal' })
    return
  }
  res.json({ ok: true })
})

recoveryRouter.post('/cases/:id/re-decide', async (req, res) => {
  const parsed = reasonSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'reason required' })
    return
  }
  const id = await humanRedecide(req.auth!.orgId, req.params.id ?? '', parsed.data.reason)
  if (!id) {
    res.status(400).json({ error: 'case not found or already terminal' })
    return
  }
  res.json({ ok: true })
})
