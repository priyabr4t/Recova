import type { NextFunction, Request, Response } from 'express'
import { logger } from './logger.js'

/**
 * Minimal fixed-window in-memory rate limiter. Good enough for a single-node
 * deployment; swap for a Redis-backed limiter when the API runs multi-node
 * (the bucket naturally lives per-process today).
 */

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

// periodically drop expired buckets so the map cannot grow unbounded
const GC_INTERVAL_MS = 60_000
setInterval(() => {
  const now = Date.now()
  for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k)
}, GC_INTERVAL_MS).unref()

export function rateLimit(opts: { windowMs: number; max: number; name: string }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown'
    const key = `${opts.name}:${ip}`
    const now = Date.now()
    const bucket = buckets.get(key)
    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs })
      res.setHeader('x-ratelimit-limit', opts.max)
      res.setHeader('x-ratelimit-remaining', opts.max - 1)
      next()
      return
    }
    bucket.count++
    if (bucket.count > opts.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
      logger.warn({ ip, name: opts.name }, 'rate limit exceeded')
      res.setHeader('retry-after', retryAfter)
      res.status(429).json({ error: 'too many requests — slow down' })
      return
    }
    res.setHeader('x-ratelimit-limit', opts.max)
    res.setHeader('x-ratelimit-remaining', opts.max - bucket.count)
    next()
  }
}
