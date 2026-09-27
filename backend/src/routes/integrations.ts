import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { encryptSecret } from '../lib/crypto.js'

export const integrationsRouter = Router()

integrationsRouter.use(requireAuth)

/**
 * Integration configuration. Secrets are write-only (encrypted at rest) — the
 * API only ever exposes whether something is configured and which mode is on.
 * livePayments=true routes retries to the real gateway; the seeded simulator
 * stays the default so a demo never depends on external accounts.
 */
integrationsRouter.get('/', async (req, res) => {
  const integ = await prisma.orgIntegration.findUnique({ where: { orgId: req.auth!.orgId } })
  res.json({
    razorpay: {
      configured: Boolean(integ?.razorpayKeyIdEnc && integ?.razorpayKeySecretEnc),
      livePayments: integ?.livePayments ?? false,
    },
    email: {
      live: integ?.emailLive ?? false,
      fromName: integ?.emailFromName ?? null,
      replyTo: integ?.emailReplyTo ?? null,
      providerConfigured: Boolean(process.env.RESEND_API_KEY),
    },
  })
})

integrationsRouter.put('/razorpay', requireRole('OWNER', 'ADMIN'), async (req, res) => {
  const parsed = z
    .object({
      keyId: z.string().min(1).max(200),
      keySecret: z.string().min(1).max(200),
      webhookSecret: z.string().max(200).optional().default(''),
      livePayments: z.boolean().default(false),
    })
    .safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid razorpay config' })
    return
  }
  const orgId = req.auth!.orgId
  const data = {
    razorpayKeyIdEnc: encryptSecret(parsed.data.keyId),
    razorpayKeySecretEnc: encryptSecret(parsed.data.keySecret),
    ...(parsed.data.webhookSecret
      ? { razorpayWebhookSecretEnc: encryptSecret(parsed.data.webhookSecret) }
      : {}),
    livePayments: parsed.data.livePayments,
  }
  const existing = await prisma.orgIntegration.findUnique({ where: { orgId } })
  if (existing) {
    await prisma.orgIntegration.update({ where: { orgId }, data })
  } else {
    await prisma.orgIntegration.create({ data: { orgId, ...data } })
  }
  res.json({ ok: true, razorpay: { configured: true, livePayments: parsed.data.livePayments } })
})

integrationsRouter.put('/email', requireRole('OWNER', 'ADMIN'), async (req, res) => {
  const parsed = z
    .object({
      fromName: z.string().max(100).optional().nullable(),
      replyTo: z.string().email().optional().nullable(),
      live: z.boolean().default(false),
    })
    .safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid email config' })
    return
  }
  const orgId = req.auth!.orgId
  const data = {
    emailLive: parsed.data.live,
    emailFromName: parsed.data.fromName ?? null,
    emailReplyTo: parsed.data.replyTo ?? null,
  }
  const existing = await prisma.orgIntegration.findUnique({ where: { orgId } })
  if (existing) {
    await prisma.orgIntegration.update({ where: { orgId }, data })
  } else {
    await prisma.orgIntegration.create({ data: { orgId, ...data } })
  }
  res.json({ ok: true, email: { ...data, providerConfigured: Boolean(process.env.RESEND_API_KEY) } })
})
