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
    JSON.stringify({ context: { ...ctx, amountRupees: Number(ctx.amountPaise) / 100 }, allowedActions }),
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
    JSON.stringify({ ...ctx, amountRupees: Number(ctx.amountPaise) / 100 }),
  )
  const parsed = classificationSchema.safeParse(raw)
  if (!parsed.success) return null
  const cause = parsed.data.cause as RecoveryCause
  return (CAUSES as readonly string[]).includes(cause)
    ? { cause, confidence: parsed.data.confidence }
    : null
}

export type EmailDraft = { subject: string; body: string; generatedBy: 'llm' | 'template' }

const TEMPLATE_BY_CAUSE: Partial<Record<RecoveryCause, { subject: string; body: (n: string, amt: string, inv: string) => string }>> = {
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
      ...input,
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
    subject:
      tpl?.subject.replace('{{merchant}}', 'your merchant').replace('{{invoice}}', input.invoiceNumber) ??
      `Regarding your pending payment ${input.invoiceNumber}`,
    body:
      tpl?.body(input.customerName, amt, input.invoiceNumber) ??
      `Hi ${input.customerName},\n\nYour payment of ${amt} for ${input.invoiceNumber} failed. We’d like to help you complete it at a time that works for you.\n\n— Recova on behalf of your merchant`,
    generatedBy: 'template',
  }
}
