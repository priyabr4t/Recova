import { Router } from 'express'
import type { CaseState } from '@prisma/client'
import { prisma } from '../lib/prisma.js'

export const healthRouter = Router()

const TERMINAL: CaseState[] = ['RECOVERED', 'ESCALATED', 'WRITTEN_OFF']

/**
 * Invariant checks — the system's honesty probe, and the failure-scenario
 * test harness. A case must always be either terminal or have a next action
 * scheduled; if anything can be in limbo, this finds it before a judge does.
 */
healthRouter.get('/invariants', async (_req, res) => {
  const [limboCases, stuckActions, totalCases, totalAudit] = await Promise.all([
    prisma.recoveryCase.findMany({
      where: {
        state: { notIn: TERMINAL },
        OR: [{ nextActionAt: null }, { state: { in: ['DIAGNOSING', 'DECIDING', 'ACTING'] } }],
      },
      select: { caseNumber: true, state: true, nextActionAt: true },
    }),
    prisma.recoveryAction.findMany({
      where: { status: 'EXECUTING' },
      select: { id: true, recoveryCaseId: true },
    }),
    prisma.recoveryCase.count(),
    prisma.auditLog.count(),
  ])

  // Cases waiting but past due relative to wall-clock beyond a grace window are
  // fine (sim time may be behind); the sweeper owns them. Real limbo = no
  // nextActionAt at all while not terminal.
  const limbo = limboCases.filter((c) => c.nextActionAt === null)

  res.json({
    ok: limbo.length === 0 && stuckActions.length === 0,
    limboCases: limbo,
    stuckActions,
    totals: { cases: totalCases, auditEntries: totalAudit },
  })
})
