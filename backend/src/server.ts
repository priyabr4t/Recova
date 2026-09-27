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
import { authRouter } from './routes/auth.js'
import { billingRouter } from './routes/billing.js'
import { orgRouter } from './routes/org.js'
import { integrationsRouter } from './routes/integrations.js'
import { rateLimit } from './lib/rateLimit.js'
import { startWorkers } from './workers/index.js'

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
// Light global limiter + strict limiter on credential endpoints.
app.use(rateLimit({ windowMs: 60_000, max: 300, name: 'global' }))
app.get('/health', (_req, res) => res.json({ ok: true }))
app.use('/auth', authRouter)
app.use('/billing', billingRouter)
app.use('/org', orgRouter)
app.use('/integrations', integrationsRouter)
app.use('/simulation', simulationRouter)
app.use('/recovery', recoveryRouter)
app.use('/summary', summaryRouter)
app.use('/health', healthRouter)

// Serve frontend in production
app.use(express.static(path.join(rootDir, 'dist-frontend')))
app.get('*', (_req, res) => {
  res.sendFile(path.join(rootDir, 'dist-frontend', 'index.html'))
})

const stopWorkers = startWorkers()

const server = app.listen(env.PORT, () => {
  logger.info(`recova api listening on :${env.PORT}`)
})

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down')
  server.close()
  await stopWorkers()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
// Last-resort net: a failed request must never take the whole demo down.
process.on('unhandledRejection', (err) => {
  logger.error({ err: String(err) }, 'unhandled rejection — request failed, server stays up')
})
