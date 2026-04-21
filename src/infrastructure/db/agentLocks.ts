import { prisma } from '@/src/infrastructure/db/client'
import type { AgentRole, BoardItemType } from '@/src/domain/coordinator/types'
import type { ConflictEntry } from '@/src/domain/coordinator/types'

const LOCK_TTL_MS = 5 * 60 * 1000 // 5-minute default; extend via heartbeat

export interface AgentLockRecord {
  id: string
  runId: string
  simulationId: string
  itemId: string
  itemType: BoardItemType
  itemTitle: string
  lockedByAgent: AgentRole
  expiresAt: Date
  createdAt: Date
}

/**
 * Attempts to acquire a write-lock for a board item in a run.
 * Returns null (and records a conflict event) if already locked by another agent.
 * Expired locks are cleared before checking.
 */
export async function acquireLock(
  runId: string,
  simulationId: string,
  itemId: string,
  itemType: BoardItemType,
  itemTitle: string,
  agentId: AgentRole,
): Promise<AgentLockRecord | null> {
  const now = new Date()

  // Clear any expired locks on this item first
  await prisma.agentLock.deleteMany({
    where: { itemId, expiresAt: { lt: now } },
  })

  const existing = await prisma.agentLock.findFirst({
    where: { runId, itemId },
  })

  if (existing) {
    await emitConflictEvent({
      runId,
      simulationId,
      itemId,
      itemType,
      itemTitle,
      requestingAgent: agentId,
      lockHeldByAgent: existing.lockedByAgent as AgentRole,
      reason: `Item already locked by ${existing.lockedByAgent} in run ${runId}. Requesting agent ${agentId} is paused.`,
    })
    return null
  }

  const lock = await prisma.agentLock.create({
    data: {
      runId,
      simulationId,
      itemId,
      itemType,
      itemTitle,
      lockedByAgent: agentId,
      expiresAt: new Date(now.getTime() + LOCK_TTL_MS),
    },
  })

  return lock as AgentLockRecord
}

/**
 * Extends the TTL of a lock (heartbeat — call every ~60s for long-running agents).
 */
export async function heartbeatLock(lockId: string): Promise<void> {
  await prisma.agentLock.update({
    where: { id: lockId },
    data: { expiresAt: new Date(Date.now() + LOCK_TTL_MS) },
  })
}

export async function getLocksForRun(runId: string): Promise<AgentLockRecord[]> {
  const locks = await prisma.agentLock.findMany({
    where: { runId },
    orderBy: { createdAt: 'asc' },
  })
  return locks as AgentLockRecord[]
}

export async function releaseLock(lockId: string): Promise<void> {
  await prisma.agentLock.delete({ where: { id: lockId } })
}

export async function releaseAllLocksForRun(runId: string): Promise<void> {
  await prisma.agentLock.deleteMany({ where: { runId } })
}

export async function getLockForItem(runId: string, itemId: string): Promise<AgentLockRecord | null> {
  const lock = await prisma.agentLock.findFirst({ where: { runId, itemId } })
  return lock ? (lock as AgentLockRecord) : null
}

/**
 * Persists a conflict event to DB. Also used from buildExecutionPlan at lock-acquire time.
 */
export async function emitConflictEvent(entry: Omit<ConflictEntry, 'detectedAt'>): Promise<void> {
  await prisma.agentConflictEvent.create({
    data: {
      runId: entry.runId ?? '',
      simulationId: entry.simulationId ?? '',
      itemId: entry.itemId,
      itemType: entry.itemType,
      itemTitle: entry.itemTitle,
      requestingAgent: entry.requestingAgent,
      lockHeldByAgent: entry.lockHeldByAgent,
      reason: entry.reason,
    },
  })
}

export async function getConflictEventsForRun(runId: string): Promise<ConflictEntry[]> {
  const rows = await prisma.agentConflictEvent.findMany({
    where: { runId },
    orderBy: { detectedAt: 'asc' },
  })
  return rows.map((r) => ({
    itemId: r.itemId,
    itemType: r.itemType as BoardItemType,
    itemTitle: r.itemTitle,
    requestingAgent: r.requestingAgent as AgentRole,
    lockHeldByAgent: r.lockHeldByAgent as AgentRole,
    reason: r.reason,
    detectedAt: r.detectedAt.toISOString(),
    runId: r.runId,
    simulationId: r.simulationId,
  }))
}
