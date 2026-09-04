import { describe, expect, it } from 'vitest'
import {
  allowedActions,
  fallbackAction,
  isAllowed,
  type RecoveryContext,
} from './rules.service.js'

const base: RecoveryContext = {
  attemptCount: 0,
  contactCount: 0,
  optedOut: false,
  harassmentCount: 0,
  cause: 'INSUFFICIENT_FUNDS',
  amountPaise: 10_000_00n, // ₹10k
}

describe('rules engine — hard constraints', () => {
  it('never automates an opted-out customer', () => {
    const allowed = allowedActions({ ...base, optedOut: true })
    expect(allowed).toEqual(['ESCALATE', 'NO_ACTION'])
  })

  it('stops outreach after harassment flags', () => {
    const allowed = allowedActions({ ...base, harassmentCount: 2 })
    expect(allowed).toEqual(['ESCALATE', 'NO_ACTION'])
  })

  it('blocks retries after the attempt cap', () => {
    const allowed = allowedActions({ ...base, attemptCount: 3 })
    expect(allowed).not.toContain('RETRY_PAYMENT')
  })

  it('never automates suspected fraud', () => {
    const allowed = allowedActions({ ...base, cause: 'SUSPECTED_FRAUD' })
    expect(allowed).toEqual(['ESCALATE', 'NO_ACTION'])
  })

  it('refuses auto-retry above the amount ceiling', () => {
    const allowed = allowedActions({ ...base, amountPaise: 10_000_000_00n }) // ₹10L
    expect(allowed).toEqual(['ESCALATE', 'NO_ACTION'])
  })
})

describe('rules engine — cause menus', () => {
  it('offers retry for insufficient funds', () => {
    expect(allowedActions(base)).toContain('RETRY_PAYMENT')
  })

  it('never offers blind retry for an expired card', () => {
    const allowed = allowedActions({ ...base, cause: 'EXPIRED_CARD' })
    expect(allowed).not.toContain('RETRY_PAYMENT')
    expect(allowed).toContain('SEND_EMAIL')
  })

  it('gives churn-intent customers exactly one respectful outreach', () => {
    expect(allowedActions({ ...base, cause: 'CUSTOMER_CHURN' })).toContain('SEND_EMAIL')
    expect(allowedActions({ ...base, cause: 'CUSTOMER_CHURN', contactCount: 1 })).not.toContain('SEND_EMAIL')
  })
})

describe('fallback policy', () => {
  it('degrades to an allowed action when the LLM suggests a blocked one', () => {
    const allowed = ['ESCALATE', 'NO_ACTION'] as const
    const fallback = fallbackAction({ ...base, optedOut: true }, [...allowed])
    expect(isAllowed(fallback, [...allowed])).toBe(true)
  })
})
