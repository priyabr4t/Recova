/**
 * Plan definitions + deterministic limit enforcement. Plans are plain data
 * checked by code — never by the LLM, never by the client. A limit breach
 * blocks AUTOMATION, never data safety: over-limit webhook events stay parked
 * (processedAt stays null) and are audited.
 */

export type PlanId = 'free' | 'pro' | 'scale' | 'demo'

export type PlanLimits = {
  label: string
  priceInr: number
  casesPerMonth: number // recovery cases automated per calendar month
  apiKeys: number
  seats: number
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: { label: 'Free', priceInr: 0, casesPerMonth: 50, apiKeys: 1, seats: 2 },
  pro: { label: 'Pro', priceInr: 4999, casesPerMonth: 2000, apiKeys: 5, seats: 10 },
  scale: { label: 'Scale', priceInr: 24999, casesPerMonth: 50_000, apiKeys: 25, seats: 100 },
  // The seeded demo workspace is not a sellable plan — unlimited for demoing.
  demo: { label: 'Demo', priceInr: 0, casesPerMonth: Number.MAX_SAFE_INTEGER, apiKeys: 5, seats: 10 },
}

export const BILLABLE_PLANS: PlanId[] = ['free', 'pro', 'scale']

export function planFor(orgPlan: string | null | undefined): PlanLimits {
  const id = (orgPlan ?? 'free') as PlanId
  return PLANS[id] ?? PLANS.free
}

export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}
