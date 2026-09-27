import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { decryptSecret } from '../lib/crypto.js'

/**
 * Integration runtime. Everything here is flag-gated per org: when a flag is
 * off (or the provider is not configured) the pipeline falls back to the demo
 * behaviour — simulated retries, drafted-not-sent emails. The demo must
 * survive a dead network, and a misconfigured org must never stall a case.
 */

export type OrgIntegration = {
  razorpayKeyId?: string
  razorpayKeySecret?: string
  razorpayWebhookSecret?: string
  livePayments: boolean
  emailLive: boolean
  emailFromName: string | null
  emailReplyTo: string | null
}

export async function getIntegration(orgId: string): Promise<OrgIntegration> {
  const row = await prisma.orgIntegration.findUnique({ where: { orgId } })
  if (!row) return { livePayments: false, emailLive: false, emailFromName: null, emailReplyTo: null }
  return {
    razorpayKeyId: row.razorpayKeyIdEnc ? decryptSecret(row.razorpayKeyIdEnc) ?? undefined : undefined,
    razorpayKeySecret: row.razorpayKeySecretEnc ? decryptSecret(row.razorpayKeySecretEnc) ?? undefined : undefined,
    razorpayWebhookSecret: row.razorpayWebhookSecretEnc
      ? decryptSecret(row.razorpayWebhookSecretEnc) ?? undefined
      : undefined,
    livePayments: row.livePayments,
    emailLive: row.emailLive,
    emailFromName: row.emailFromName,
    emailReplyTo: row.emailReplyTo,
  }
}

const resendApiKey = process.env.RESEND_API_KEY ?? ''

/**
 * Attempts a real send via Resend when the org opted into live email AND the
 * platform has RESEND_API_KEY. Returns sent=false (with reason) otherwise —
 * the caller keeps the draft in the audit trail either way.
 */
export async function sendEmailLive(
  integ: OrgIntegration,
  msg: { to: string | null; subject: string; body: string },
): Promise<{ sent: boolean; reason?: string; providerId?: string }> {
  if (!integ.emailLive) return { sent: false, reason: 'live email disabled — draft only' }
  if (!resendApiKey) return { sent: false, reason: 'email provider not configured (RESEND_API_KEY missing)' }
  if (!msg.to) return { sent: false, reason: 'customer has no email address' }

  const from = `${integ.emailFromName ?? 'Recova Recovery'} <onboarding@resend.dev>`
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${resendApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [msg.to],
        subject: msg.subject,
        text: msg.body,
        ...(integ.emailReplyTo ? { reply_to: integ.emailReplyTo } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      logger.warn({ status: res.status }, 'resend send failed')
      return { sent: false, reason: `provider error ${res.status}: ${text.slice(0, 200)}` }
    }
    const body = (await res.json()) as { id?: string }
    return { sent: true, providerId: body.id }
  } catch (err) {
    logger.warn({ err: String(err) }, 'resend send failed')
    return { sent: false, reason: `provider unreachable: ${String(err).slice(0, 200)}` }
  }
}
