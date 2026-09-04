import type { RecoveryCause } from '@prisma/client'

/**
 * Deterministic pre-classifier. Razorpay error codes map to causes with a plain
 * lookup — the LLM is only consulted when this returns null (missing/unknown
 * code). Rationale: 100 LLM calls in the demo's critical path is latency and
 * flakiness we don't need; we spend tokens only where judgment is required.
 */
const ERROR_CODE_MAP: Record<string, RecoveryCause> = {
  insufficient_fund: 'INSUFFICIENT_FUNDS',
  card_expired: 'EXPIRED_CARD',
  bank_declined: 'BANK_DECLINE',
  authentication_failed: 'AUTHENTICATION_FAILED',
  gateway_network_error: 'NETWORK_ERROR',
  customer_stopped_payment: 'CUSTOMER_CHURN',
  fraud_suspected: 'SUSPECTED_FRAUD',
}

export function preClassify(errorCode?: string | null): RecoveryCause | null {
  if (!errorCode) return null
  return ERROR_CODE_MAP[errorCode.toLowerCase()] ?? null
}
