import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import crypto from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { env } from './env.js'
import { prisma } from './prisma.js'
import { logger } from './logger.js'

/**
 * Auth + tenancy boundary.
 *
 *  - Browser sessions: JWT (HS256, 7d) in an httpOnly cookie.
 *  - Webhook ingestion: `x-api-key: rk_<prefix>_<secret>` — only the SHA-256
 *    hash of the secret is stored; lookup by prefix, then timing-safe compare.
 *
 * Both resolve to the same shape on the request: req.auth = { orgId, ... }.
 * Every org-scoped query MUST come from req.auth — never from a request body.
 */

export const SESSION_COOKIE = 'recova_session'
const SESSION_TTL_SECONDS = 7 * 24 * 3600

const secretKey = new TextEncoder().encode(env.AUTH_SECRET)

export type SessionPayload = { userId: string; orgId: string; role: string }

export type AuthContext = SessionPayload

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext
    }
  }
}

// ---------- passwords ----------

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// ---------- session JWT ----------

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey)
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey)
    if (typeof payload.userId !== 'string' || typeof payload.orgId !== 'string') return null
    return { userId: payload.userId, orgId: payload.orgId, role: String(payload.role ?? 'MEMBER') }
  } catch {
    return null
  }
}

export function setSessionCookie(res: Response, token: string): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`,
  )
}

export function clearSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
}

// ---------- API keys ----------

export function generateApiKey(): { raw: string; prefix: string; hashedKey: string } {
  const prefix = crypto.randomBytes(4).toString('hex')
  const secret = crypto.randomBytes(24).toString('hex')
  const raw = `rk_${prefix}_${secret}`
  return { raw, prefix, hashedKey: hashApiKeySecret(secret) }
}

export function hashApiKeySecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex')
}

// ---------- middleware ----------

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return rest.join('=')
  }
  return null
}

/** Browser session auth. 401s without a valid session cookie. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = readCookie(req, SESSION_COOKIE)
  const session = token ? await verifySessionToken(token) : null
  if (!session) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }
  req.auth = session
  next()
}

/** Requires one of the given org roles (session auth only). */
export function requireRole(...roles: Array<'OWNER' | 'ADMIN' | 'MEMBER'>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.auth?.role as (typeof roles)[number] | undefined
    if (!role || !roles.includes(role)) {
      res.status(403).json({ error: 'insufficient role' })
      return
    }
    next()
  }
}

/**
 * Webhook ingestion auth: resolves the org from the API key header.
 * The Razorpay HMAC verify stays layered on top (webhooks.ts).
 */
export async function requireApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const raw = req.header('x-api-key') ?? ''
  const m = raw.match(/^rk_([a-f0-9]{8})_([a-f0-9]+)$/)
  if (!m) {
    res.status(401).json({ error: 'missing or malformed api key' })
    return
  }
  const [, prefix, secret] = m
  const key = await prisma.apiKey.findFirst({ where: { prefix: prefix! } })
  const hashed = hashApiKeySecret(secret!)
  if (!key || key.hashedKey.length !== hashed.length || !crypto.timingSafeEqual(Buffer.from(key.hashedKey), Buffer.from(hashed))) {
    logger.warn({ prefix }, 'webhook api key rejected')
    res.status(401).json({ error: 'invalid api key' })
    return
  }
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
  req.auth = { userId: '', orgId: key.orgId, role: 'SYSTEM' }
  next()
}
