import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import type { ActorType } from '@prisma/client'

/**
 * Append-only audit. Every state transition lands here with its actor.
 * "Every money action explainable" — this table is the proof.
 *
 * Signature: audit(orgId, recoveryCaseId, actor, event, metadata?).
 * orgId is null only for GLOBAL system events (sim clock), which never appear
 * in a tenant's audit export.
 */
export async function audit(
  orgId: string | null,
  recoveryCaseId: string | null,
  actor: ActorType,
  event: string,
  metadata?: Prisma.InputJsonValue,
): Promise<void> {
  await prisma.auditLog.create({
    data: { orgId, recoveryCaseId, actor, event, metadata },
  })
}

/** A tenant's audit trail as CSV — the "prove the numbers" artifact. */
export async function buildAuditCsv(orgId: string): Promise<string> {
  const rows = await prisma.auditLog.findMany({
    where: { orgId },
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
