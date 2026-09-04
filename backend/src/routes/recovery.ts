import { Router } from 'express'
import type { CaseState } from '@prisma/client'
import { getCaseDetail, listCases, startBatch } from '../services/recovery.service.js'
import { buildAuditCsv } from '../services/audit.service.js'

export const recoveryRouter = Router()

recoveryRouter.post('/start', async (_req, res) => {
  res.json(await startBatch())
})

recoveryRouter.get('/cases', async (req, res) => {
  const state = req.query.state as CaseState | undefined
  const limit = req.query.limit ? Number(req.query.limit) : undefined
  res.json(await listCases({ state, limit }))
})

recoveryRouter.get('/audit/export', async (_req, res) => {
  const csv = await buildAuditCsv()
  res.setHeader('content-type', 'text/csv; charset=utf-8')
  res.setHeader('content-disposition', 'attachment; filename="recova-audit-log.csv"')
  res.send(csv)
})

recoveryRouter.get('/cases/:id', async (req, res) => {
  const detail = await getCaseDetail(req.params.id ?? '')
  if (!detail) {
    res.status(404).json({ error: 'case not found' })
    return
  }
  res.json(detail)
})
