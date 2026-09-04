import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import type { ActorType } from '@prisma/client'

/**
 * Append-only audit. Every state transition lands here with its actor.
 * "Every money action explainable" — this table is the proof.
 */
export async function audit(
  recoveryCaseId: string | null,
  actor: ActorType,
  event: string,
  metadata?: Prisma.InputJsonValue,
): Promise<void> {
  await prisma.auditLog.create({
    data: { recoveryCaseId, actor, event, metadata },
  })
}

/** Full audit trail as CSV — the demo's "prove the numbers" artifact. */
export async function buildAuditCsv(): Promise<string> {
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'asc' },
    include: { recoveryCase: { select: { caseNumber: true } } },
  })
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const lines = ['id,timestamp,caseNumber,actor,event,metadata']
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.createdAt.toISOString(),
        r.recoveryCase?.caseNumber ?? '',
        r.actor,
        r.event,
        esc(JSON.stringify(r.metadata ?? {})),
      ].join(','),
    )
  }
  return lines.join('\n')
}
