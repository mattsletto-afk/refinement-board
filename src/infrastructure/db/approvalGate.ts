/**
 * Approval Gate — timeout detection and escalation
 * Tracks pending approvals; marks timed-out ones and emits escalation events.
 */

import { prisma } from '@/src/infrastructure/db/client'
import { appendAuditEvent } from '@/src/infrastructure/db/auditLog'

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'timed_out' | 'escalated'

export interface CreateApprovalInput {
  projectId:    string
  runId:        string
  sessionId?:   string
  entityType:   string
  entityId?:    string
  entityTitle:  string
  requestedBy:  string   // agentId or userId
  timeoutMs?:   number   // default 48h (consent window from ADR-001)
  description?: string
}

export interface ApprovalRecord {
  id:          string
  projectId:   string
  runId:       string
  sessionId?:  string | null
  entityType:  string
  entityId?:   string | null
  entityTitle: string
  requestedBy: string
  status:      ApprovalStatus
  expiresAt:   Date
  decidedAt?:  Date | null
  decidedBy?:  string | null
  notes?:      string | null
  createdAt:   Date
}

const DEFAULT_TIMEOUT_MS = 48 * 60 * 60 * 1000  // 48 hours (ADR-001 consent window)
const ESCALATION_THRESHOLD_MS = 24 * 60 * 60 * 1000  // escalate after 24h

// SLA timeouts by classification
const SLA_BY_CLASSIFICATION: Record<string, number> = {
  safe:        0,                          // auto-approve immediately
  'unsafe-low':  24 * 60 * 60 * 1000,     // 24 hours
  'unsafe-high': 72 * 60 * 60 * 1000,     // 72 hours
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createApproval(input: CreateApprovalInput & { classification?: string }): Promise<ApprovalRecord> {
  const classification = input.classification ?? 'unsafe-low'

  // Safe changes: auto-approve immediately, no human gate needed
  if (classification === 'safe') {
    const record = await prisma.approvalGate.create({
      data: {
        projectId:   input.projectId,
        runId:       input.runId,
        sessionId:   input.sessionId,
        entityType:  input.entityType,
        entityId:    input.entityId,
        entityTitle: input.entityTitle,
        requestedBy: input.requestedBy,
        status:      'approved',
        expiresAt:   new Date(),
        decidedAt:   new Date(),
        decidedBy:   'system-auto',
        description: input.description ?? '',
        notes:       'Auto-approved: safe classification',
      },
    })
    return record as ApprovalRecord
  }

  const slaMs = SLA_BY_CLASSIFICATION[classification] ?? DEFAULT_TIMEOUT_MS
  const timeoutMs = input.timeoutMs ?? slaMs
  const expiresAt = new Date(Date.now() + timeoutMs)

  const record = await prisma.approvalGate.create({
    data: {
      projectId:   input.projectId,
      runId:       input.runId,
      sessionId:   input.sessionId,
      entityType:  input.entityType,
      entityId:    input.entityId,
      entityTitle: input.entityTitle,
      requestedBy: input.requestedBy,
      status:      'pending',
      expiresAt,
      description: input.description ?? '',
    },
  })

  await appendAuditEvent({
    projectId:   input.projectId,
    eventType:   'approval.granted',
    actorType:   'system',
    actorId:     input.requestedBy,
    runId:       input.runId,
    sessionId:   input.sessionId,
    entityType:  input.entityType,
    entityId:    input.entityId,
    entityTitle: input.entityTitle,
    details:     { approvalId: record.id, expiresAt: expiresAt.toISOString(), status: 'pending' },
  }).catch(() => {})

  return record as ApprovalRecord
}

// ── Decide ────────────────────────────────────────────────────────────────────

export async function decideApproval(
  approvalId: string,
  decision:   'approved' | 'denied',
  decidedBy:  string,
  notes?:     string,
): Promise<ApprovalRecord> {
  const record = await prisma.approvalGate.update({
    where: { id: approvalId },
    data: {
      status:    decision,
      decidedAt: new Date(),
      decidedBy,
      notes,
    },
  })

  await appendAuditEvent({
    projectId:  record.projectId,
    eventType:  decision === 'approved' ? 'approval.granted' : 'approval.denied',
    actorType:  'user',
    actorId:    decidedBy,
    runId:      record.runId,
    entityType: record.entityType,
    entityId:   record.entityId ?? undefined,
    entityTitle: record.entityTitle,
    details:    { approvalId, decision, notes },
  }).catch(() => {})

  return record as ApprovalRecord
}

// ── Timeout sweep (call from a cron / background worker) ─────────────────────

export interface TimeoutSweepResult {
  timedOut:  number
  escalated: number
}

export async function sweepExpiredApprovals(projectId?: string): Promise<TimeoutSweepResult> {
  const now = new Date()
  const where = {
    status:    'pending' as const,
    expiresAt: { lt: now },
    ...(projectId ? { projectId } : {}),
  }

  const expired = await prisma.approvalGate.findMany({ where })

  let timedOut  = 0
  let escalated = 0

  for (const record of expired) {
    await prisma.approvalGate.update({
      where: { id: record.id },
      data:  { status: 'timed_out', decidedAt: now, notes: 'Auto-expired: no decision within timeout window' },
    })

    // Pause linked simulation session — operator must manually resume
    if (record.sessionId) {
      await prisma.simulationSession.updateMany({
        where: { id: record.sessionId, status: 'running' },
        data:  { status: 'paused' },
      }).catch(() => {})
    }

    await appendAuditEvent({
      projectId:   record.projectId,
      eventType:   'approval.timeout',
      actorType:   'system',
      runId:       record.runId,
      entityType:  record.entityType,
      entityId:    record.entityId ?? undefined,
      entityTitle: record.entityTitle,
      details:     { approvalId: record.id, expiredAt: now.toISOString() },
    }).catch(() => {})

    timedOut++
  }

  // Escalate pending approvals past the escalation threshold (but not yet timed out)
  const escalationCutoff = new Date(now.getTime() - ESCALATION_THRESHOLD_MS)
  const toEscalate = await prisma.approvalGate.findMany({
    where: {
      status:    'pending',
      createdAt: { lt: escalationCutoff },
      expiresAt: { gt: now },
      ...(projectId ? { projectId } : {}),
    },
  })

  for (const record of toEscalate) {
    await prisma.approvalGate.update({
      where: { id: record.id },
      data:  { status: 'escalated' },
    })

    await appendAuditEvent({
      projectId:   record.projectId,
      eventType:   'approval.timeout',
      actorType:   'system',
      runId:       record.runId,
      entityType:  record.entityType,
      entityId:    record.entityId ?? undefined,
      entityTitle: record.entityTitle,
      details:     { approvalId: record.id, escalatedAt: now.toISOString(), reason: 'No decision after 24h' },
    }).catch(() => {})

    escalated++
  }

  return { timedOut, escalated }
}

export async function getPendingApprovals(projectId: string): Promise<ApprovalRecord[]> {
  const records = await prisma.approvalGate.findMany({
    where:   { projectId, status: { in: ['pending', 'escalated'] } },
    orderBy: { expiresAt: 'asc' },
  })
  return records as ApprovalRecord[]
}

export async function getApproval(id: string): Promise<ApprovalRecord | null> {
  const record = await prisma.approvalGate.findUnique({ where: { id } })
  return record ? (record as ApprovalRecord) : null
}
