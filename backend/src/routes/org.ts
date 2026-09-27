import crypto from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { generateApiKey, hashPassword } from '../lib/auth.js'
import { planFor } from '../lib/plans.js'
import { audit } from '../services/audit.service.js'

export const orgRouter = Router()

orgRouter.use(requireAuth)

/** Workspace info + member list. */
orgRouter.get('/', async (req, res) => {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: req.auth!.orgId },
    include: {
      users: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  })
  res.json({
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan: org.plan,
    members: org.users.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
    })),
  })
})

orgRouter.patch('/', requireRole('OWNER', 'ADMIN'), async (req, res) => {
  const parsed = z.object({ name: z.string().min(1).max(100) }).safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid name' })
    return
  }
  await prisma.organization.update({ where: { id: req.auth!.orgId }, data: { name: parsed.data.name } })
  res.json({ ok: true })
})

/**
 * Invite a teammate. No email delivery yet (Phase 4) — if the person has no
 * account, one is provisioned and a ONE-TIME temp password is returned to the
 * inviting admin to hand over. Deterministic, audited.
 */
orgRouter.post('/invite', requireRole('OWNER', 'ADMIN'), async (req, res) => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.auth!.orgId } })
  const limits = planFor(org.plan)
  const memberCount = await prisma.membership.count({ where: { orgId: org.id } })
  if (memberCount >= limits.seats) {
    res.status(402).json({ error: `plan limit reached (${limits.seats} seats on ${limits.label}) — upgrade to invite more` })
    return
  }

  const parsed = z
    .object({
      email: z.string().email(),
      role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
      name: z.string().min(1).max(100).optional(),
    })
    .safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid invite' })
    return
  }
  const email = parsed.data.email.toLowerCase()

  let user = await prisma.user.findUnique({ where: { email } })
  let tempPassword: string | null = null
  if (!user) {
    tempPassword = crypto.randomBytes(9).toString('base64url')
    user = await prisma.user.create({
      data: {
        email,
        name: parsed.data.name ?? email.split('@')[0]!,
        passwordHash: await hashPassword(tempPassword),
      },
    })
  }
  const existing = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: org.id, userId: user.id } },
  })
  if (existing) {
    res.status(409).json({ error: 'this person is already a member of the workspace' })
    return
  }
  await prisma.membership.create({ data: { orgId: org.id, userId: user.id, role: parsed.data.role } })
  await audit(org.id, null, 'HUMAN', 'MEMBER_INVITED', { email, role: parsed.data.role })
  res.json({ ok: true, userId: user.id, tempPassword })
})

orgRouter.delete('/members/:userId', requireRole('OWNER', 'ADMIN'), async (req, res) => {
  const orgId = req.auth!.orgId
  const target = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId, userId: req.params.userId ?? '' } },
  })
  if (!target) {
    res.status(404).json({ error: 'member not found' })
    return
  }
  if (target.role === 'OWNER') {
    const owners = await prisma.membership.count({ where: { orgId, role: 'OWNER' } })
    if (owners <= 1) {
      res.status(400).json({ error: 'cannot remove the last owner' })
      return
    }
  }
  await prisma.membership.delete({ where: { id: target.id } })
  await audit(orgId, null, 'HUMAN', 'MEMBER_REMOVED', { userId: req.params.userId })
  res.json({ ok: true })
})

// ---------- API keys ----------

orgRouter.get('/keys', async (req, res) => {
  const keys = await prisma.apiKey.findMany({
    where: { orgId: req.auth!.orgId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, prefix: true, label: true, lastUsedAt: true, createdAt: true },
  })
  res.json(keys)
})

orgRouter.post('/keys', requireRole('OWNER', 'ADMIN'), async (req, res) => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.auth!.orgId } })
  const limits = planFor(org.plan)
  const count = await prisma.apiKey.count({ where: { orgId: org.id } })
  if (count >= limits.apiKeys) {
    res.status(402).json({ error: `plan limit reached (${limits.apiKeys} keys on ${limits.label}) — upgrade or revoke a key` })
    return
  }
  const parsed = z.object({ label: z.string().min(1).max(100).default('webhook') }).safeParse(req.body)
  const key = generateApiKey()
  const created = await prisma.apiKey.create({
    data: {
      orgId: org.id,
      prefix: key.prefix,
      hashedKey: key.hashedKey,
      label: parsed.success ? parsed.data.label : 'webhook',
    },
  })
  await audit(org.id, null, 'HUMAN', 'API_KEY_CREATED', { prefix: key.prefix, label: created.label })
  // The raw key is shown exactly once — only its SHA-256 hash is stored.
  res.json({ id: created.id, prefix: key.prefix, label: created.label, key: key.raw })
})

orgRouter.delete('/keys/:id', requireRole('OWNER', 'ADMIN'), async (req, res) => {
  const deleted = await prisma.apiKey.deleteMany({
    where: { id: req.params.id ?? '', orgId: req.auth!.orgId },
  })
  if (deleted.count === 0) {
    res.status(404).json({ error: 'key not found' })
    return
  }
  await audit(req.auth!.orgId, null, 'HUMAN', 'API_KEY_REVOKED', { keyId: req.params.id })
  res.json({ ok: true })
})
