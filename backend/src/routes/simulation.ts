import { Router } from 'express'
import { z } from 'zod'
import { getSimNow, advanceDays } from '../services/simclock.service.js'
import { resetData, seed } from '../lib/seed.js'
import { requireAuth } from '../lib/auth.js'

export const simulationRouter = Router()

simulationRouter.use(requireAuth)

simulationRouter.get('/state', async (_req, res) => {
  res.json({ simNow: await getSimNow() })
})

simulationRouter.post('/advance', async (req, res) => {
  const parsed = z.object({ days: z.number().positive().max(30) }).safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors })
    return
  }
  const simNow = await advanceDays(parsed.data.days)
  res.json({ simNow, note: 'sweeper will pick up due cases within its tick interval' })
})

/** Full deterministic reset: same seed ⇒ same demo. For the judge who clicks twice. */
simulationRouter.post('/reset', async (_req, res) => {
  await resetData()
  await seed()
  res.json({ reset: true })
})
