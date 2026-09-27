import crypto from 'node:crypto'
import { env } from './env.js'

/**
 * AES-256-GCM encryption for per-org integration secrets (Razorpay keys).
 * Key is derived from AUTH_SECRET — rotating AUTH_SECRET invalidates stored
 * credentials, which is the correct failure mode for a secrets store.
 * Format: v1:<iv-b64>:<tag-b64>:<ciphertext-b64>
 */

const key = crypto.createHash('sha256').update(env.AUTH_SECRET).digest()

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`
}

export function decryptSecret(stored: string): string | null {
  const [v, ivB64, tagB64, ctB64] = stored.split(':')
  if (v !== 'v1' || !ivB64 || !tagB64 || !ctB64) return null
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
