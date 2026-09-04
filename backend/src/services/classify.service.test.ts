import { describe, expect, it } from 'vitest'
import { preClassify } from './classify.service.js'
import { hashString, mulberry32 } from '../lib/rng.js'

describe('deterministic error-code pre-classifier', () => {
  it('maps every known Razorpay error code to a cause', () => {
    expect(preClassify('insufficient_fund')).toBe('INSUFFICIENT_FUNDS')
    expect(preClassify('card_expired')).toBe('EXPIRED_CARD')
    expect(preClassify('bank_declined')).toBe('BANK_DECLINE')
    expect(preClassify('authentication_failed')).toBe('AUTHENTICATION_FAILED')
    expect(preClassify('gateway_network_error')).toBe('NETWORK_ERROR')
    expect(preClassify('customer_stopped_payment')).toBe('CUSTOMER_CHURN')
    expect(preClassify('fraud_suspected')).toBe('SUSPECTED_FRAUD')
  })

  it('is case-insensitive', () => {
    expect(preClassify('CARD_EXPIRED')).toBe('EXPIRED_CARD')
  })

  it('returns null for unknown or missing codes so the LLM is consulted', () => {
    expect(preClassify('mystery_code')).toBeNull()
    expect(preClassify(null)).toBeNull()
    expect(preClassify(undefined)).toBeNull()
  })
})

describe('seeded RNG (demo reproducibility)', () => {
  it('produces the same sequence for the same seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const seqA = [a(), a(), a(), a()]
    const seqB = [b(), b(), b(), b()]
    expect(seqA).toEqual(seqB)
  })

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    expect([a(), a()]).not.toEqual([b(), b()])
  })

  it('hashes stably (case:attempt:salt keys must not drift between runs)', () => {
    expect(hashString('case1:2:42')).toBe(hashString('case1:2:42'))
    expect(hashString('case1:2:42')).not.toBe(hashString('case2:2:42'))
  })
})
