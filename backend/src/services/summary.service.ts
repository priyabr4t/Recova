import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { recoveryRate } from '../lib/money.js'

const TERMINAL_STATES = ['RECOVERED', 'ESCALATED', 'WRITTEN_OFF'] as const

/**
 * Dashboard numbers. Computed ONLY from the ledger/cases/actions tables —
 * never from LLM output. A judge clicking around must see the same story the
 * pitch slide tells.
 */
export async function getSummary() {
  const cases = await prisma.recoveryCase.findMany({ include: { ledger: true } })

  let atRisk = 0n
  let recovered = 0n
  let attempted = 0n
  for (const c of cases) {
    atRisk += c.ledger?.atRiskPaise ?? 0n
    recovered += c.ledger?.recoveredPaise ?? 0n
    attempted += c.ledger?.attemptedPaise ?? 0n
  }

  const byState = countBy(cases, (c) => c.state)
  const byCause = new Map<string, { total: number; recovered: number; recoveredPaise: bigint; totalPaise: bigint }>()
  for (const c of cases) {
    const key = c.cause ?? 'UNCLASSIFIED'
    const agg = byCause.get(key) ?? { total: 0, recovered: 0, recoveredPaise: 0n, totalPaise: 0n }
    agg.total++
    agg.totalPaise += c.ledger?.atRiskPaise ?? 0n
    if (c.state === 'RECOVERED') {
      agg.recovered++
      agg.recoveredPaise += c.ledger?.recoveredPaise ?? 0n
    }
    byCause.set(key, agg)
  }

  const [ruleBlocks, llmDecisions, escalations] = await Promise.all([
    prisma.recoveryAction.count({ where: { status: 'BLOCKED' } }),
    prisma.recoveryAction.count({ where: { llmDecision: { not: Prisma.DbNull } } }),
    prisma.recoveryCase.count({ where: { state: 'ESCALATED' } }),
  ])

  const exceptions = await prisma.recoveryCase.findMany({
    where: { state: { in: ['ESCALATED', 'WRITTEN_OFF'] } },
    include: { invoice: true, customer: true },
    orderBy: { amountPaise: 'desc' },
    take: 10,
  })

  return {
    money: {
      atRiskPaise: atRisk,
      recoveredPaise: recovered,
      outstandingPaise: atRisk - recovered,
      attemptedPaise: attempted,
      recoveryRate: recoveryRate(recovered, atRisk),
    },
    counts: {
      totalCases: cases.length,
      recovered: byState['RECOVERED'] ?? 0,
      escalated: byState['ESCALATED'] ?? 0,
      writtenOff: byState['WRITTEN_OFF'] ?? 0,
      inFlight: cases.filter((c) => !TERMINAL_STATES.includes(c.state as (typeof TERMINAL_STATES)[number])).length,
      ruleBlocks,
      llmDecisions,
      escalations,
    },
    recoveryByCause: [...byCause.entries()]
      .map(([cause, agg]) => ({
        cause,
        total: agg.total,
        recovered: agg.recovered,
        recoveryRate: agg.total === 0 ? 0 : Math.round((agg.recovered / agg.total) * 100),
        recoveredPaise: agg.recoveredPaise,
        totalPaise: agg.totalPaise,
      }))
      .sort((a, b) => b.total - a.total),
    exceptions: exceptions.map((c) => ({
      caseNumber: c.caseNumber,
      invoiceNumber: c.invoice.invoiceNumber,
      customer: c.customer.name,
      amountPaise: c.amountPaise,
      state: c.state,
      cause: c.cause,
      attempts: c.attemptCount,
    })),
  }
}

function countBy<T>(items: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1
  return out
}
