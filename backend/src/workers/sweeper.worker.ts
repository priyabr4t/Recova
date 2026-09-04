import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { getSimNow } from '../services/simclock.service.js'
import { decisionQueue } from '../lib/queues.js'

const TICK_MS = 2_000

/**
 * THE SWEEPER — the DB is the source of truth for "what's due".
 *
 * Why this exists (gap G1): BullMQ delayed jobs are lost on Redis restart and
 * can't be fast-forwarded by the simulation clock. Instead of scheduling
 * timers, decisions write `nextActionAt` to Postgres; this sweeper claims due
 * cases with a conditional state transition and re-enqueues them. Advancing
 * the sim clock therefore advances the entire world, deterministically.
 */
export function startSweeper(): NodeJS.Timeout {
  return setInterval(() => {
    void sweep().catch((err) => logger.error({ err: String(err) }, 'sweep failed'))
  }, TICK_MS)
}

export async function sweep(): Promise<number> {
  const simNow = await getSimNow()
  const due = await prisma.recoveryCase.findMany({
    where: { state: 'WAITING_SCHEDULE', nextActionAt: { lte: simNow } },
    select: { id: true },
    take: 100,
  })

  let claimed = 0
  for (const { id } of due) {
    // Conditional claim: only one sweeper tick can move a case to DECIDING.
    const claim = await prisma.recoveryCase.updateMany({
      where: { id, state: 'WAITING_SCHEDULE' },
      data: { state: 'DECIDING' },
    })
    if (claim.count === 0) continue
    claimed++
    await decisionQueue.add(
      'decision',
      { caseId: id },
      { jobId: `decision-${id}-${Date.now()}`, removeOnComplete: true },
    )
  }
  if (claimed > 0) logger.info({ claimed, simNow: simNow.toISOString() }, 'sweeper claimed due cases')
  return claimed
}
