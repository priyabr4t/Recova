import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from './lib/env.js'
import { logger } from './lib/logger.js'
import { webhookRouter } from './routes/webhooks.js'
import { simulationRouter } from './routes/simulation.js'
import { recoveryRouter } from './routes/recovery.js'
import { summaryRouter } from './routes/summary.js'
import { healthRouter } from './routes/health.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const app = express()
app.disable('x-powered-by')

// BigInt → number in all JSON responses (money is BigInt paise internally).
app.set('json replacer', (_key: string, value: unknown) =>
  typeof value === 'bigint' ? Number(value) : value,
)

// Webhooks need the RAW body for HMAC verification — mount before express.json().
app.use('/webhooks', express.raw({ type: '*/*', limit: '256kb' }), webhookRouter)

app.use(express.json())
app.get('/health', (_req, res) => res.json({ ok: true }))
app.use('/simulation', simulationRouter)
app.use('/recovery', recoveryRouter)
app.use('/summary', summaryRouter)
app.use('/health', healthRouter)

// Serve frontend in production
app.use(express.static(path.join(rootDir, 'dist-frontend')))
app.get('*', (_req, res) => {
  res.sendFile(path.join(rootDir, 'dist-frontend', 'index.html'))
})

app.listen(env.PORT, () => {
  logger.info(`recova api listening on :${env.PORT}`)
})
