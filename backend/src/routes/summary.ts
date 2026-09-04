import { Router } from 'express'
import { getSummary } from '../services/summary.service.js'

export const summaryRouter = Router()

summaryRouter.get('/', async (_req, res) => {
  res.json(await getSummary())
})
