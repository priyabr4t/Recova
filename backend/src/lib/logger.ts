import pino from 'pino'
import { env } from './env.js'

export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
})
