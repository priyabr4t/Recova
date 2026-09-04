import { RecoveryActionType, type RecoveryCause } from '@prisma/client'

/**
 * THE RULES ENGINE — the most important file in the project.
 *
 * Principle: the LLM decides what is appropriate; deterministic code decides
 * what is allowed. The LLM's suggestion is only executed if it appears in the
 * allowed set returned here. Hard constraints (opt-out, harassment, caps,
 * fraud, amount ceilings) can never be talked around by a prompt.
 */

export type AllowedAction = keyof typeof RecoveryActionType

export type RecoveryContext = {
  attemptCount: number
  contactCount: number
  optedOut: boolean
  harassmentCount: number
  cause: RecoveryCause | null
  amountPaise: bigint
}

export const MAX_RETRIES = 3 // payment retry attempts per case
export const MAX_CONTACTS = 3 // outreach messages per case
export const AUTO_RETRY_MAX_PAISE = 500_000_00n // ₹5,00,000 — above this, humans only
export const MIN_HARASSMENT_BEFORE_BLOCK = 2

/** Quiet hours (22:00–08:00 IST). Outreach is deferred, never dropped. */
export function nextContactableTime(simNow: Date): Date {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
  const ist = new Date(simNow.getTime() + IST_OFFSET_MS)
  const hour = ist.getUTCHours()

  let next = new Date(ist)
  if (hour >= 22) {
    next.setUTCHours(8, 0, 0, 0)
    next = new Date(next.getTime() + 24 * 60 * 60 * 1000)
  } else if (hour < 8) {
    next.setUTCHours(8, 0, 0, 0)
  } else {
    return simNow // already contactable
  }
  return new Date(next.getTime() - IST_OFFSET_MS)
}

export function allowedActions(ctx: RecoveryContext): AllowedAction[] {
  // Hard constraints — non-negotiable, checked before anything else.
  if (ctx.optedOut || ctx.harassmentCount >= MIN_HARASSMENT_BEFORE_BLOCK) {
    return ['ESCALATE', 'NO_ACTION']
  }

  const needsHuman =
    ctx.attemptCount >= MAX_RETRIES ||
    ctx.cause === 'SUSPECTED_FRAUD' ||
    ctx.amountPaise > AUTO_RETRY_MAX_PAISE
  if (needsHuman) {
    return ['ESCALATE', 'NO_ACTION']
  }

  // Cause-appropriate menus. Retry is only ever offered for failures where a
  // plain retry plausibly succeeds; expired cards need the customer to act.
  switch (ctx.cause) {
    case 'INSUFFICIENT_FUNDS':
      return ctx.contactCount >= MAX_CONTACTS
        ? ['RETRY_PAYMENT', 'ESCALATE', 'NO_ACTION']
        : ['RETRY_PAYMENT', 'SEND_EMAIL', 'ESCALATE', 'NO_ACTION']
    case 'EXPIRED_CARD':
    case 'AUTHENTICATION_FAILED':
      return ctx.contactCount >= MAX_CONTACTS
        ? ['ESCALATE', 'NO_ACTION']
        : ['SEND_EMAIL', 'ESCALATE', 'NO_ACTION']
    case 'BANK_DECLINE':
    case 'NETWORK_ERROR':
    case 'UNKNOWN':
      return ctx.contactCount >= MAX_CONTACTS
        ? ['RETRY_PAYMENT', 'ESCALATE', 'NO_ACTION']
        : ['RETRY_PAYMENT', 'SEND_EMAIL', 'ESCALATE', 'NO_ACTION']
    case 'CUSTOMER_CHURN':
      // A churn-intent customer gets exactly one respectful outreach, then humans.
      return ctx.contactCount === 0
        ? ['SEND_EMAIL', 'ESCALATE', 'NO_ACTION']
        : ['ESCALATE', 'NO_ACTION']
    default:
      return ['ESCALATE', 'NO_ACTION']
  }
}

export function isAllowed(action: AllowedAction, allowed: AllowedAction[]): boolean {
  return allowed.includes(action)
}

/**
 * Deterministic fallback when the LLM is down, times out, or suggests
 * something outside the allowed set. A case NEVER stalls because the model
 * misbehaved — it degrades to this policy.
 */
export function fallbackAction(ctx: RecoveryContext, allowed: AllowedAction[]): AllowedAction {
  const priority: AllowedAction[] =
    ctx.cause === 'EXPIRED_CARD' || ctx.cause === 'AUTHENTICATION_FAILED' || ctx.cause === 'CUSTOMER_CHURN'
      ? ['SEND_EMAIL', 'ESCALATE', 'NO_ACTION']
      : ['RETRY_PAYMENT', 'SEND_EMAIL', 'ESCALATE', 'NO_ACTION']
  return priority.find((a) => allowed.includes(a)) ?? 'ESCALATE'
}

/** Retry backoff schedule in sim-hours (1h, 3d, 5d — real dunning heuristics). */
export const RETRY_DELAYS_H = [1, 72, 120]
export function retryDelayHours(attemptIndex: number): number {
  return RETRY_DELAYS_H[Math.min(attemptIndex, RETRY_DELAYS_H.length - 1)] ?? 120
}
