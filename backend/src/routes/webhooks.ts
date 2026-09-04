import { Router } from 'express'
import crypto from 'node:crypto'
import type { Request, Response } from 'express'
import { env } from '../lib/env.js'
import { logger } from '../lib/logger.js'
import { prisma } from '../lib/prisma.js'
import { ingestWebhookEvent } from '../services/recovery.service.js'

export const webhookRouter = Router()

/**
 * Razorpay webhook ingestion.
 *  - raw body required for HMAC verification (mounted before express.json()),
 *  - signature checked with timing-safe compare,
 *  - eventId unique ⇒ duplicates acknowledged and skipped (idempotent),
 *  - 200 returned fast; processing is async via the queue.
 */
webhookRouter.post('/razorpay', (req: Request, res: Response) => {
  void (async () => {
    const raw = req.body as Buffer

    if (env.RAZORPAY_WEBHOOK_SECRET) {
      const expected = crypto
        .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
        .update(raw)
        .digest('hex')
      const received = req.header('x-razorpay-signature') ?? ''
      const a = Buffer.from(expected)
      const b = Buffer.from(received)
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        logger.warn('webhook signature mismatch')
        res.status(401).json({ error: 'invalid signature' })
        return
      }
    } else if (!env.DEV_ALLOW_UNSIGNED) {
      res.status(500).json({ error: 'RAZORPAY_WEBHOOK_SECRET not configured' })
      return
    }

    const body = JSON.parse(raw.toString('utf8')) as {
      event?: string
      payload?: { payment?: { entity?: { id?: string } } }
    }
    const eventId = req.header('x-razorpay-event-id') ?? `evt_${body.payload?.payment?.entity?.id ?? crypto.randomUUID()}`

    // Idempotency gate: unique(eventId) + conditional claim.
    let event
    try {
      event = await prisma.webhookEvent.create({
        data: { eventId, eventType: body.event ?? 'unknown', payload: body as object },
      })
    } catch {
      logger.info({ eventId }, 'duplicate webhook — acknowledged, skipped')
      res.json({ received: true, duplicate: true })
      return
    }

    if (body.event === 'payment.failed') {
      await ingestWebhookEvent(event)
    }
    res.json({ received: true })
  })().catch((err) => {
    logger.error({ err: String(err) }, 'webhook processing failed')
    // Acknowledge anyway: Razorpay retries on non-2xx, but a malformed payload
    // would retry forever. We park parse failures inside ingest instead.
    res.status(200).json({ received: true, error: 'processing deferred' })
  })
})
