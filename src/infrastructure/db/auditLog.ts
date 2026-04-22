import { createHash } from 'crypto'
import { prisma } from '@/src/infrastructure/db/client'

// ── Event type catalogue ──────────────────────────────────────────────────────

export type AuditEventType =
  | 'run.triggered'   | 'run.completed'   | 'run.failed'
  | 'change.applied'  | 'change.skipped'  | 'change.rejected'
  | 'approval.granted'| 'approval.denied' | 'approval.timeout' | 'approval.expired' | 'approval.approved'
  | 'lock.acquired'   | 'lock.conflict'
  | 'sandbox.executed'| 'sandbox.timeout'
  | 'test.completed'  | 'test.failed'
  | 'commit.created'  | 'pr.opened'
  | 'coordinator.sequence_started' | 'coordinator.sequence_completed'
  | 'coordinator.conflict_detected' | 'coordinator.lock_acquired' | 'coordinator.lock_released'
  | 'coordinator.handoff_completed'

export type ActorType = 'system' | 'user' | 'agent'

export interface AppendAuditInput {
  projectId:   string
  eventType:   AuditEventType
  actorType?:  ActorType
  actorId?:    string
  runId?:      string
  sessionId?:  string
  entityType?: string
  entityId?:   string
  entityTitle?: string
  details?:    Record<string, unknown>
}

// ── Hash chain ────────────────────────────────────────────────────────────────

function computeEntryHash(
  seqNum:    number,
  projectId: string,
  eventType: string,
  details:   string,
  prevHash:  string,
): string {
  return createHash('sha256')
    .update(`${seqNum}|${projectId}|${eventType}|${details}|${prevHash}`)
    .digest('hex')
}

// ── Append (the only write path) ─────────────────────────────────────────────

export async function appendAuditEvent(input: AppendAuditInput): Promise<string> {
  const details = JSON.stringify(input.details ?? {})

  // Serialise writes per project using DB-level atomic seqNum increment.
  // SQLite serialises writes naturally; for Postgres upgrade to advisory lock.
  const last = await prisma.auditLog.findFirst({
    where:   { projectId: input.projectId },
    orderBy: { seqNum: 'desc' },
    select:  { seqNum: true, entryHash: true },
  })

  const seqNum   = (last?.seqNum ?? 0) + 1
  const prevHash = last?.entryHash ?? ''
  const entryHash = computeEntryHash(seqNum, input.projectId, input.eventType, details, prevHash)

  const entry = await prisma.auditLog.create({
    data: {
      projectId:   input.projectId,
      eventType:   input.eventType,
      actorType:   input.actorType ?? 'system',
      actorId:     input.actorId ?? '',
      runId:       input.runId,
      sessionId:   input.sessionId,
      entityType:  input.entityType ?? '',
      entityId:    input.entityId,
      entityTitle: input.entityTitle ?? '',
      details,
      seqNum,
      prevHash,
      entryHash,
    },
  })

  return entry.id
}

// ── Chain verification ────────────────────────────────────────────────────────

export interface ChainVerifyResult {
  valid:        boolean
  checkedCount: number
  firstBadSeq?: number
  error?:       string
}

export async function verifyAuditChain(projectId: string): Promise<ChainVerifyResult> {
  const entries = await prisma.auditLog.findMany({
    where:   { projectId },
    orderBy: { seqNum: 'asc' },
    select:  { seqNum: true, eventType: true, details: true, prevHash: true, entryHash: true },
  })

  let prevHash = ''
  for (const entry of entries) {
    const seqNum = entry.seqNum ?? 0
    const expected = computeEntryHash(seqNum, projectId, entry.eventType ?? '', entry.details ?? '', prevHash)
    if (expected !== (entry.entryHash ?? '')) {
      return { valid: false, checkedCount: seqNum, firstBadSeq: seqNum }
    }
    prevHash = entry.entryHash ?? ''

  }

  return { valid: true, checkedCount: entries.length }
}

// ── Query helpers ─────────────────────────────────────────────────────────────

export async function queryAuditLog(opts: {
  projectId:  string
  eventType?: AuditEventType
  runId?:     string
  limit?:     number
  offset?:    number
}) {
  return prisma.auditLog.findMany({
    where: {
      projectId: opts.projectId,
      ...(opts.eventType ? { eventType: opts.eventType } : {}),
      ...(opts.runId     ? { runId: opts.runId }         : {}),
    },
    orderBy: { seqNum: 'desc' },
    take:    opts.limit  ?? 100,
    skip:    opts.offset ?? 0,
  })
}
