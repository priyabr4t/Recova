import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { rateLimit } from '../lib/rateLimit.js'
import {
  hashPassword,
  verifyPassword,
  signSession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
} from '../lib/auth.js'

export const authRouter = Router()

const signupSchema = z.object({
  name: z.string().min(1).max(100),
  orgName: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(200),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'org'
}

async function uniqueSlug(base: string): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const candidate = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`
    const exists = await prisma.organization.findUnique({ where: { slug: candidate } })
    if (!exists) return candidate
  }
  return `${base}-${Date.now().toString(36)}`
}

async function sessionFor(userId: string): Promise<string | null> {
  const membership = await prisma.membership.findFirst({
    where: { userId },
    orderBy: { role: 'asc' }, // OWNER first if member of several
  })
  if (!membership) return null
  return signSession({ userId, orgId: membership.orgId, role: membership.role })
}

// Brute-force protection on credential endpoints.
const authLimiter = rateLimit({ windowMs: 60_000, max: 10, name: 'auth' })

authRouter.post('/signup', authLimiter, async (req, res) => {
  const parsed = signupSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid signup', fields: parsed.error.flatten().fieldErrors })
    return
  }
  const { name, orgName, email, password } = parsed.data

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    res.status(409).json({ error: 'an account with this email already exists' })
    return
  }

  const passwordHash = await hashPassword(password)
  const user = await prisma.user.create({ data: { name, email, passwordHash } })
  const org = await prisma.organization.create({
    data: {
      name: orgName,
      slug: await uniqueSlug(slugify(orgName)),
      users: { create: { userId: user.id, role: 'OWNER' } },
    },
  })

  const token = await signSession({ userId: user.id, orgId: org.id, role: 'OWNER' })
  setSessionCookie(res, token)
  res.json(meResponse(user.id, org.id, 'OWNER', user.name, user.email, org.name, org.slug))
})

authRouter.post('/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid login' })
    return
  }
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  // Constant-shape response: never leak whether the email exists.
  const ok = user && (await verifyPassword(parsed.data.password, user.passwordHash))
  if (!user || !ok) {
    res.status(401).json({ error: 'invalid email or password' })
    return
  }
  const token = await sessionFor(user.id)
  if (!token) {
    res.status(403).json({ error: 'account has no organization' })
    return
  }
  const membership = await prisma.membership.findFirstOrThrow({ where: { userId: user.id } })
  const org = await prisma.organization.findUnique({ where: { id: membership.orgId } })
  setSessionCookie(res, token)
  res.json(meResponse(user.id, membership.orgId, membership.role, user.name, user.email, org?.name, org?.slug))
})

authRouter.post('/logout', async (_req, res) => {
  clearSessionCookie(res)
  res.json({ ok: true })
})

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } })
  if (!user) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }
  const org = await prisma.organization.findUnique({ where: { id: req.auth!.orgId } })
  res.json(meResponse(user.id, req.auth!.orgId, req.auth!.role, user.name, user.email, org?.name, org?.slug))
})

authRouter.patch('/me', requireAuth, async (req, res) => {
  const parsed = z.object({ name: z.string().min(1).max(100) }).safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid name' })
    return
  }
  await prisma.user.update({ where: { id: req.auth!.userId }, data: { name: parsed.data.name } })
  res.json({ ok: true })
})

authRouter.post('/password', requireAuth, async (req, res) => {
  const parsed = z.object({ current: z.string().min(1), next: z.string().min(8).max(200) }).safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'new password must be at least 8 characters' })
    return
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } })
  const ok = await verifyPassword(parsed.data.current, user.passwordHash)
  if (!ok) {
    res.status(401).json({ error: 'current password is incorrect' })
    return
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.next) },
  })
  res.json({ ok: true })
})

function meResponse(
  userId: string,
  orgId: string,
  role: string,
  name?: string,
  email?: string,
  orgName?: string,
  orgSlug?: string,
) {
  return { user: { id: userId, name: name ?? '', email: email ?? '' }, org: { id: orgId, name: orgName ?? '', slug: orgSlug ?? '' }, role }
}
