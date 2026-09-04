import type { RecoveryCause } from '@prisma/client'
import { env } from '../lib/env.js'
import { hashString, mulberry32 } from '../lib/rng.js'

/**
 * Simulated payment gateway. In Razorpay test mode a batch of 100 retries
 * behaves unpredictably; a hackathon demo must be reproducible. So Recova
 * OWNS retry outcomes: seeded RNG per (caseId, attemptNo, SIM_SEED).
 *
 * The dashboard labels outcomes "simulated, seeded" — honest about what is
 * real (the pipeline, the rules, the accounting) vs simulated (the bank).
 */

const RETRY_SUCCESS_RATE: Partial<Record<RecoveryCause, number>> = {
  INSUFFICIENT_FUNDS: 0.65,
  BANK_DECLINE: 0.35,
  NETWORK_ERROR: 0.9,
  AUTHENTICATION_FAILED: 0.15,
  EXPIRED_CARD: 0.05,
  CUSTOMER_CHURN: 0.02,
  UNKNOWN: 0.3,
}

const EMAIL_RECOVERY_RATE: Partial<Record<RecoveryCause, number>> = {
  INSUFFICIENT_FUNDS: 0.25,
  EXPIRED_CARD: 0.55, // customer updates card
  AUTHENTICATION_FAILED: 0.5,
  BANK_DECLINE: 0.15,
  NETWORK_ERROR: 0.3,
  CUSTOMER_CHURN: 0.08,
  UNKNOWN: 0.2,
}

function rngFor(caseId: string, salt: string): () => number {
  return mulberry32(hashString(`${caseId}:${salt}:${env.SIM_SEED}`))
}

export type RetryResult = { success: boolean; providerPaymentId: string; errorCode?: string }

export function retryPayment(caseId: string, attemptNo: number, cause: RecoveryCause | null): RetryResult {
  const rng = rngFor(caseId, `retry:${attemptNo}`)
  const p = (cause && RETRY_SUCCESS_RATE[cause]) ?? 0.3
  const success = rng() < p
  return {
    success,
    providerPaymentId: `pay_sim_${hashString(`${caseId}:${attemptNo}`)}`,
    errorCode: success ? undefined : cause === 'INSUFFICIENT_FUNDS' ? 'insufficient_fund' : 'bank_declined',
  }
}

export function simulateEmailOutcome(caseId: string, cause: RecoveryCause | null): { recovered: boolean } {
  const rng = rngFor(caseId, 'email')
  const p = (cause && EMAIL_RECOVERY_RATE[cause]) ?? 0.2
  return { recovered: rng() < p }
}
