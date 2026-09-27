import { Router } from 'express'
import { getSummary } from '../services/summary.service.js'
import { requireAuth } from '../lib/auth.js'

export const summaryRouter = Router()

summaryRouter.use(requireAuth)

summaryRouter.get('/', async (req, res) => {
  res.json(await getSummary(req.auth!.orgId))
})
