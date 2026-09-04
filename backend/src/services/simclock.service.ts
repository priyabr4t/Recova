import { prisma } from '../lib/prisma.js'
import { audit } from './audit.service.js'

/**
 * The sim clock. DB row id=1 is the ONLY source of "now".
 * Why: BullMQ delayed jobs die with Redis and can't be fast-forwarded.
 * A sweeper (workers/sweeper.worker.ts) polls `nextActionAt <= simNow`, so
 * advancing the clock advances the whole world — deterministically.
 */

export async function ensureClock(): Promise<void> {
  const existing = await prisma.systemState.findUnique({ where: { id: 1 } })
  if (!existing) {
    await prisma.systemState.create({ data: { id: 1, simNow: new Date() } })
  }
}

export async function getSimNow(): Promise<Date> {
  const s = await prisma.systemState.findUniqueOrThrow({ where: { id: 1 } })
  return s.simNow
}

export async function advanceDays(days: number): Promise<Date> {
  const simNow = await getSimNow()
  const next = new Date(simNow.getTime() + days * 24 * 60 * 60 * 1000)
  await prisma.systemState.update({ where: { id: 1 }, data: { simNow: next } })
  await audit(null, 'SYSTEM', 'SIM_CLOCK_ADVANCED', { days, simNow: next.toISOString() })
  return next
}
