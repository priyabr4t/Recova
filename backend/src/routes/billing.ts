import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { BILLABLE_PLANS, monthStart, planFor, PLANS } from '../lib/plans.js'
import { audit } from '../services/audit.service.js'

export const billingRouter = Router()

billingRouter.use(requireAuth)

/**
 * Billing + usage. Payments are NOT live: when STRIPE_SECRET_KEY is unset the
 * plan switch applies immediately and is labelled dev-mode in the UI. Wiring
 * real Stripe checkout/customer-portal is the remaining Phase 3 item (TODO.md).
 */
const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY)

async function usageFor(orgId: string) {
  const [casesThisMonth, apiKeys, members] = await Promise.all([
    prisma.recoveryCase.count({ where: { orgId, createdAt: { gte: monthStart() } } }),
    prisma.apiKey.count({ where: { orgId } }),
    prisma.membership.count({ where: { orgId } }),
  ])
  return { casesThisMonth, apiKeys, members }
}

billingRouter.get('/', async (req, res) => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.auth!.orgId } })
  const plan = planFor(org.plan)
  res.json({
    plan: org.plan,
    planLabel: plan.label,
    limits: { casesPerMonth: plan.casesPerMonth, apiKeys: plan.apiKeys, seats: plan.seats },
    usage: await usageFor(org.id),
    availablePlans: BILLABLE_PLANS.map((id) => ({ id, ...PLANS[id] })),
    stripeConfigured,
    devMode: !stripeConfigured,
  })
})

billingRouter.post('/plan', requireRole('OWNER', 'ADMIN'), async (req, res) => {
  const parsed = z.object({ plan: z.enum(['free', 'pro', 'scale']) }).safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid plan' })
    return
  }
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.auth!.orgId } })
  await prisma.organization.update({ where: { id: org.id }, data: { plan: parsed.data.plan } })
  await audit(org.id, null, 'HUMAN', 'PLAN_CHANGED', {
    from: org.plan,
    to: parsed.data.plan,
    mode: stripeConfigured ? 'stripe' : 'dev',
  })
  res.json({ ok: true, plan: parsed.data.plan, mode: stripeConfigured ? 'stripe' : 'dev' })
})

export { usageFor }
