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
