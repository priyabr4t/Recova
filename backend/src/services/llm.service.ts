import { z } from 'zod'
import type { RecoveryCause } from '@prisma/client'
import { env, llmEnabled } from '../lib/env.js'
import { logger } from '../lib/logger.js'

/**
 * LLM boundary. Every function:
 *  - returns null / a template when the LLM is disabled, times out, or emits
 *    garbage — the pipeline must keep moving (offline demo survival),
 *  - is constrained to structured output validated with zod,
 *  - NEVER decides an action outside the allowed set passed in — the rules
 *    engine's veto still applies on top of whatever comes back.
 */

const decisionSchema = z.object({
  action: z.string(),
  reason: z.string().min(1).max(1000),
  confidence: z.number().min(0).max(1),
})

const classificationSchema = z.object({
  cause: z.string(),
  confidence: z.number().min(0).max(1),
})

const CAUSES = [
  'INSUFFICIENT_FUNDS', 'EXPIRED_CARD', 'BANK_DECLINE', 'AUTHENTICATION_FAILED',
  'NETWORK_ERROR', 'SUSPECTED_FRAUD', 'CUSTOMER_CHURN', 'UNKNOWN',
] as const

async function chatJSON(system: string, user: string): Promise<unknown | null> {
  if (!llmEnabled) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), env.LLM_TIMEOUT_MS)
  try {
    const res = await fetch(`${env.OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.LLM_MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    })
    if (!res.ok) throw new Error(`llm http ${res.status}`)
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = body.choices?.[0]?.message?.content
    return content ? JSON.parse(content) : null
  } catch (err) {
    logger.warn({ err: String(err) }, 'llm call failed — caller must fall back')
    return null
  } finally {
    clearTimeout(timer)
  }
}

export type LlmDecision = { action: string; reason: string; confidence: number }

export async function decideAction(
  ctx: {
    cause: RecoveryCause | null
    amountPaise: bigint
    attemptCount: number
    contactCount: number
    priorSuccessfulPayments: number
  },
  allowedActions: string[],
): Promise<LlmDecision | null> {
  const raw = await chatJSON(
    'You are the recovery-decision policy inside Recova, a payment-recovery system. ' +
      'You MUST choose one action from the allowed list — you have no other authority. ' +
      'Weigh cause, amount, attempt history and customer history. Explain briefly and concretely. ' +
      'Respond as JSON: {"action": string, "reason": string, "confidence": number(0-1)}.',
    // BigInt paise must never enter JSON.stringify — pass rupees only.
    JSON.stringify({
      context: {
        cause: ctx.cause,
        attemptCount: ctx.attemptCount,
        contactCount: ctx.contactCount,
        priorSuccessfulPayments: ctx.priorSuccessfulPayments,
        amountRupees: Number(ctx.amountPaise) / 100,
      },
      allowedActions,
    }),
  )
  const parsed = decisionSchema.safeParse(raw)
  if (!parsed.success) return null
  if (!allowedActions.includes(parsed.data.action)) {
    logger.info({ suggested: parsed.data.action, allowed: allowedActions }, 'llm suggested blocked action')
    return null
  }
  return parsed.data
}

export async function classifyAmbiguous(ctx: {
  errorCode?: string | null
  errorDescription?: string | null
  amountPaise: bigint
}): Promise<{ cause: RecoveryCause; confidence: number } | null> {
  const raw = await chatJSON(
    'Classify a failed payment into exactly one cause. ' +
      `Options: ${CAUSES.join(', ')}. Respond as JSON: {"cause": string, "confidence": number(0-1)}.`,
    JSON.stringify({
      errorCode: ctx.errorCode,
      errorDescription: ctx.errorDescription,
      amountRupees: Number(ctx.amountPaise) / 100,
    }),
  )
  const parsed = classificationSchema.safeParse(raw)
  if (!parsed.success) return null
  const cause = parsed.data.cause as RecoveryCause
  return (CAUSES as readonly string[]).includes(cause)
    ? { cause, confidence: parsed.data.confidence }
    : null
}

export type EmailDraft = { subject: string; body: string; generatedBy: 'llm' | 'template' }

const TEMPLATE_BY_CAUSE: Record<RecoveryCause, { subject: string; body: (n: string, amt: string, inv: string) => string }> = {
  INSUFFICIENT_FUNDS: {
    subject: 'Your payment to {{merchant}} didn’t go through',
    body: (n, amt, inv) =>
      `Hi ${n},\n\nThe ${amt} payment for ${inv} didn’t complete — looks like the bank declined it for insufficient balance.\n\nNo action needed if you’ve already topped up; we’ll retry shortly. If another time suits you better, just reply with a day and we’ll schedule it then.\n\n— Recova on behalf of your merchant`,
  },
  EXPIRED_CARD: {
    subject: 'Action needed: update your card for {{invoice}}',
    body: (n, amt, inv) =>
      `Hi ${n},\n\nYour card on file for ${inv} (${amt}) has expired, so the payment couldn’t complete.\n\nTwo minutes to update the card and everything goes back to normal. Here’s the secure link: https://pay.example.com/update-card\n\n— Recova on behalf of your merchant`,
  },
  BANK_DECLINE: {
    subject: 'Your bank declined the payment for {{invoice}}',
    body: (n, amt, inv) =>
      `Hi ${n},\n\nYour bank declined the ${amt} payment for ${inv}. This is usually temporary — a security hold or a limit on your card.\n\nA quick call to your bank (or a different payment method) usually sorts it out. We can also retry whenever you’re ready.\n\n— Recova on behalf of your merchant`,
  },
  AUTHENTICATION_FAILED: {
    subject: 'One more step needed to complete your payment',
    body: (n, amt, inv) =>
      `Hi ${n},\n\nThe ${amt} payment for ${inv} stopped at bank verification (the 2FA step didn’t complete).\n\nIf you still want this payment to go through, just retry it and approve the bank’s prompt. It takes a moment.\n\n— Recova on behalf of your merchant`,
  },
  NETWORK_ERROR: {
    subject: 'A glitch interrupted your payment — no action lost',
    body: (n, amt, inv) =>
      `Hi ${n},\n\nA network hiccup interrupted the ${amt} payment for ${inv}. Nothing was charged.\n\nWe’ll retry shortly on your behalf. If you’d rather pick a different time or method, just reply to this email.\n\n— Recova on behalf of your merchant`,
  },
  SUSPECTED_FRAUD: {
    subject: 'Regarding your payment for {{invoice}}',
    body: (n, amt, inv) =>
      `Hi ${n},\n\nA payment for ${inv} (${amt}) was flagged by our risk checks and couldn’t complete. For your security, our team will review and reach out personally before anything is retried.\n\nIf you made this payment attempt yourself, no action is needed.\n\n— Recova on behalf of your merchant`,
  },
  CUSTOMER_CHURN: {
    subject: 'We’ve paused your payment — we’d love to know why',
    body: (n, amt, inv) =>
      `Hi ${n},\n\nWe noticed the ${amt} payment for ${inv} was stopped, and we’ve paused all further attempts — that’s your call to make, and we respect it.\n\nIf something about the product or billing didn’t work for you, we’d genuinely like to hear it. One reply is all it takes.\n\n— Recova on behalf of your merchant`,
  },
  UNKNOWN: {
    subject: 'Your payment for {{invoice}} didn’t go through',
    body: (n, amt, inv) =>
      `Hi ${n},\n\nThe ${amt} payment for ${inv} didn’t complete, and we’re still checking with the bank on exactly why.\n\nNo money left your account. We’ll keep you posted, and you can retry anytime that suits you.\n\n— Recova on behalf of your merchant`,
  },
}

export async function draftEmail(input: {
  cause: RecoveryCause | null
  customerName: string
  amountPaise: bigint
  invoiceNumber: string
}): Promise<EmailDraft> {
  const raw = await chatJSON(
    'You write payment-recovery emails for Recova. Warm, human, zero dunning-shame, ' +
      'at most 90 words, one clear action. Respond as JSON: {"subject": string, "body": string}.',
    JSON.stringify({
      cause: input.cause,
      customerName: input.customerName,
      invoiceNumber: input.invoiceNumber,
      amountRupees: Number(input.amountPaise) / 100,
      tone: 'warm, respectful, Indian-English',
    }),
  )
  if (raw && typeof raw === 'object' && 'subject' in raw && 'body' in raw) {
    const r = raw as { subject: string; body: string }
    if (typeof r.subject === 'string' && typeof r.body === 'string') {
      return { subject: r.subject, body: r.body, generatedBy: 'llm' }
    }
  }
  const tpl = TEMPLATE_BY_CAUSE[input.cause ?? 'UNKNOWN']
  const amt = `₹${(Number(input.amountPaise) / 100).toLocaleString('en-IN')}`
  return {
    subject: tpl.subject.replace('{{merchant}}', 'your merchant').replace('{{invoice}}', input.invoiceNumber),
    body: tpl.body(input.customerName, amt, input.invoiceNumber),
    generatedBy: 'template',
  }
}
