import { describe, expect, it } from 'vitest'
import {
  allowedActions,
  fallbackAction,
  isAllowed,
  nextContactableTime,
  retryDelayHours,
  RETRY_DELAYS_H,
  type AllowedAction,
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

  it('still allows retry at exactly the amount ceiling', () => {
    const allowed = allowedActions({ ...base, amountPaise: 50_000_000n }) // ₹5L
    expect(allowed).toContain('RETRY_PAYMENT')
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

  it('drops outreach from the menu once the contact cap is hit', () => {
    const allowed = allowedActions({ ...base, contactCount: 3 })
    expect(allowed).not.toContain('SEND_EMAIL')
    expect(allowed).toContain('RETRY_PAYMENT')
  })
})

describe('quiet hours (22:00–08:00 IST)', () => {
  it('returns now when already contactable', () => {
    // 12:00 IST
    const now = new Date('2026-09-01T06:30:00.000Z')
    expect(nextContactableTime(now)).toBe(now)
  })

  it('defers a 23:00 IST outreach to 08:00 IST the next day', () => {
    const now = new Date('2026-09-01T17:30:00.000Z') // 23:00 IST
    const next = nextContactableTime(now)
    const istHour = (next.getTime() + 5.5 * 3600_000) % 86_400_000 / 3_600_000
    expect(next.getTime()).toBeGreaterThan(now.getTime())
    expect(istHour).toBe(8)
  })

  it('defers a 03:00 IST outreach to 08:00 IST the same day', () => {
    const now = new Date('2026-09-01T21:30:00.000Z') // 03:00 IST
    const next = nextContactableTime(now)
    expect(next.getTime()).toBeGreaterThan(now.getTime())
    expect(next.getTime() - now.getTime()).toBe(5 * 3600_000)
  })
})

describe('retry backoff ladder', () => {
  it('follows 1h → 3d → 5d and clamps at the last step', () => {
    expect(RETRY_DELAYS_H).toEqual([1, 72, 120])
    expect(retryDelayHours(0)).toBe(1)
    expect(retryDelayHours(1)).toBe(72)
    expect(retryDelayHours(2)).toBe(120)
    expect(retryDelayHours(9)).toBe(120)
  })
})

describe('fallback policy', () => {
  it('degrades to an allowed action when the LLM suggests a blocked one', () => {
    const allowed = ['ESCALATE', 'NO_ACTION'] as const
    const fallback = fallbackAction({ ...base, optedOut: true }, [...allowed])
    expect(isAllowed(fallback, [...allowed])).toBe(true)
  })

  it('prefers email-first for causes where retry is pointless', () => {
    const allowed: AllowedAction[] = ['SEND_EMAIL', 'ESCALATE', 'NO_ACTION']
    expect(fallbackAction({ ...base, cause: 'EXPIRED_CARD' }, allowed)).toBe('SEND_EMAIL')
  })
})
