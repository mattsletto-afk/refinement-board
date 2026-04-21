import { prisma } from './client'
import { fingerprintFromChange, type ChangeInput } from '@/src/domain/fingerprint'

// ── Types ─────────────────────────────────────────────────────────────────────

export type SuggestionStatus = 'proposed' | 'drafted' | 'applied' | 'superseded' | 'duplicate' | 'rejected'
export type SuggestionAction = 'create' | 'update' | 'delete' | 'reparent' | 'comment' | 'bundle'
export type EntityType = 'epic' | 'feature' | 'story' | 'task' | 'risk' | 'milestone' | 'workstream' | 'unknown'

export interface SuggestionRecord {
  id: string
  projectId: string
  sessionId: string | null
  runId: string
  fingerprintHash: string
  fingerprint: string          // readable pre-hash
  type: string                 // action
  entityType: string
  summary: string              // headline / title
  description: string
  rationale: string
  assumptions: string[]
  proposedChanges: Record<string, unknown>  // payload
  confidenceLevel: string
  impactedEntities: { type: string; id?: string; title: string }[]
  status: SuggestionStatus
  reviewStatus: string
  supersedesIds: string[]
  duplicateOfId: string | null
  appliedEntityId: string | null
  appliedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateSuggestionInput {
  projectId: string
  sessionId?: string | null
  runId: string
  action: SuggestionAction
  entityType?: EntityType
  title: string
  description?: string
  rationale?: string
  assumptions?: string[]
  payload?: Record<string, unknown>
  confidence?: string
  impactedEntities?: { type: string; id?: string; title: string }[]
  // Optional: override fingerprint (e.g. for bundle/comment types)
  fingerprintOverride?: { readable: string; hash: string }
  // For update/reparent: scope to specific entity
  targetEntityId?: string
}

// ── Dedup resolution ──────────────────────────────────────────────────────────

export type DedupeOutcome =
  | { action: 'create' }
  | { action: 'refine'; existingId: string }
  | { action: 'enhance'; existingId: string }
  | { action: 'skip'; reason: 'applied' | 'duplicate' }
  | { action: 'supersede'; existingId: string }

export async function resolveDedup(projectId: string, fingerprintHash: string): Promise<DedupeOutcome> {
  if (!fingerprintHash) return { action: 'create' }

  const existing = await prisma.agentSuggestion.findFirst({
    where: { projectId, fingerprintHash },
    orderBy: { createdAt: 'desc' },
  })

  if (!existing) return { action: 'create' }

  switch (existing.status as SuggestionStatus) {
    case 'proposed':    return { action: 'refine',    existingId: existing.id }
    case 'drafted':     return { action: 'enhance',   existingId: existing.id }
    case 'applied':     return { action: 'skip',      reason: 'applied' }
    case 'duplicate':   return { action: 'skip',      reason: 'duplicate' }
    case 'superseded':  return { action: 'supersede', existingId: existing.id }
    case 'rejected':    return { action: 'skip',      reason: 'duplicate' }
    default:            return { action: 'create' }
  }
}

// ── Repository ────────────────────────────────────────────────────────────────

function serialize(input: CreateSuggestionInput): {
  readable: string; hash: string
} {
  if (input.fingerprintOverride) return input.fingerprintOverride

  const changeInput: ChangeInput = {
    action: input.action,
    entityType: input.entityType ?? 'unknown',
    title: input.title,
    projectId: input.projectId,
    entityId: input.targetEntityId,
  }
  return fingerprintFromChange(changeInput)
}

export async function saveSuggestion(input: CreateSuggestionInput): Promise<{
  record: SuggestionRecord
  outcome: DedupeOutcome
}> {
  const { readable, hash } = serialize(input)
  const outcome = await resolveDedup(input.projectId, hash)

  if (outcome.action === 'skip') {
    // Return the existing record as-is
    const existing = await prisma.agentSuggestion.findFirst({
      where: { projectId: input.projectId, fingerprintHash: hash },
    })
    return { record: toRecord(existing!), outcome }
  }

  if (outcome.action === 'refine' || outcome.action === 'enhance') {
    // Merge: update description, rationale, payload if richer; bump to 'drafted'
    const updated = await prisma.agentSuggestion.update({
      where: { id: outcome.existingId },
      data: {
        description:     input.description    || undefined,
        rationale:       input.rationale      || undefined,
        proposedChanges: input.payload        ? JSON.stringify(input.payload) : undefined,
        assumptions:     input.assumptions    ? JSON.stringify(input.assumptions) : undefined,
        confidenceLevel: input.confidence     || undefined,
        status:          'drafted',
        runId:           input.runId,         // update to latest run
        sessionId:       input.sessionId ?? null,
      },
    })
    return { record: toRecord(updated), outcome }
  }

  if (outcome.action === 'supersede') {
    // Mark old as superseded, create new
    await prisma.agentSuggestion.update({
      where: { id: outcome.existingId },
      data: { status: 'superseded' },
    })
  }

  const created = await prisma.agentSuggestion.create({
    data: {
      projectId:       input.projectId,
      sessionId:       input.sessionId ?? null,
      runId:           input.runId,
      fingerprintHash: hash,
      fingerprint:     readable,
      type:            input.action,
      entityType:      input.entityType ?? 'unknown',
      summary:         input.title,
      description:     input.description   ?? '',
      rationale:       input.rationale     ?? '',
      assumptions:     JSON.stringify(input.assumptions ?? []),
      proposedChanges: JSON.stringify(input.payload ?? {}),
      confidenceLevel: input.confidence    ?? 'medium',
      impactedEntities:JSON.stringify(input.impactedEntities ?? []),
      status:          'proposed',
      reviewStatus:    'unreviewed',
      supersedesIds:   outcome.action === 'supersede' ? JSON.stringify([outcome.existingId]) : '[]',
    },
  })

  return { record: toRecord(created), outcome: { action: 'create' } }
}

// Mark a suggestion as applied and record which entity was created
export async function markApplied(suggestionId: string, appliedEntityId: string): Promise<void> {
  await prisma.agentSuggestion.update({
    where: { id: suggestionId },
    data: { status: 'applied', appliedEntityId, appliedAt: new Date(), reviewStatus: 'reviewed' },
  })
}

// Mark as duplicate of another
export async function markDuplicate(suggestionId: string, canonicalId: string): Promise<void> {
  await prisma.agentSuggestion.update({
    where: { id: suggestionId },
    data: { status: 'duplicate', duplicateOfId: canonicalId },
  })
}

// Advance lifecycle manually (reviewer action)
export async function advanceStatus(suggestionId: string, status: SuggestionStatus, reviewedBy?: string): Promise<SuggestionRecord> {
  const updated = await prisma.agentSuggestion.update({
    where: { id: suggestionId },
    data: { status, reviewedAt: new Date(), reviewedBy: reviewedBy ?? null, reviewStatus: 'reviewed' },
  })
  return toRecord(updated)
}

// Query
export async function getSuggestionsByProject(projectId: string, status?: SuggestionStatus): Promise<SuggestionRecord[]> {
  const rows = await prisma.agentSuggestion.findMany({
    where: { projectId, ...(status ? { status } : {}), fingerprintHash: { not: '' } },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(toRecord)
}

export async function getAppliedFingerprints(projectId: string): Promise<Set<string>> {
  const rows = await prisma.agentSuggestion.findMany({
    where: { projectId, status: 'applied', fingerprintHash: { not: '' } },
    select: { fingerprintHash: true },
  })
  return new Set(rows.map(r => r.fingerprintHash))
}

export async function getSkippedFingerprints(projectId: string): Promise<Set<string>> {
  const rows = await prisma.agentSuggestion.findMany({
    where: { projectId, status: { in: ['duplicate', 'rejected'] }, fingerprintHash: { not: '' } },
    select: { fingerprintHash: true },
  })
  return new Set(rows.map(r => r.fingerprintHash))
}

export async function getAppliedReadableFingerprints(projectId: string): Promise<string[]> {
  const rows = await prisma.agentSuggestion.findMany({
    where: { projectId, status: 'applied', fingerprint: { not: '' } },
    select: { fingerprint: true },
  })
  return rows.map(r => r.fingerprint).filter(Boolean)
}

export async function getSkippedReadableFingerprints(projectId: string): Promise<string[]> {
  const rows = await prisma.agentSuggestion.findMany({
    where: { projectId, status: { in: ['duplicate', 'rejected'] }, fingerprint: { not: '' } },
    select: { fingerprint: true },
  })
  return rows.map(r => r.fingerprint).filter(Boolean)
}

// ── Internal mapper ───────────────────────────────────────────────────────────

export function toRecord(row: {
  id: string; projectId: string; sessionId: string | null; runId: string
  fingerprintHash: string; fingerprint: string; type: string; entityType: string
  summary: string; description: string; rationale: string; assumptions: string
  proposedChanges: string; confidenceLevel: string; impactedEntities: string
  status: string; reviewStatus: string; supersedesIds: string
  duplicateOfId: string | null; appliedEntityId: string | null; appliedAt: Date | null
  createdAt: Date; updatedAt: Date
}): SuggestionRecord {
  return {
    id:               row.id,
    projectId:        row.projectId,
    sessionId:        row.sessionId,
    runId:            row.runId,
    fingerprintHash:  row.fingerprintHash,
    fingerprint:      row.fingerprint,
    type:             row.type,
    entityType:       row.entityType,
    summary:          row.summary,
    description:      row.description,
    rationale:        row.rationale,
    assumptions:      safeParseArray(row.assumptions) as string[],
    proposedChanges:  safeParseObj(row.proposedChanges),
    confidenceLevel:  row.confidenceLevel,
    impactedEntities: safeParseArray(row.impactedEntities) as { type: string; id?: string; title: string }[],
    status:           row.status as SuggestionStatus,
    reviewStatus:     row.reviewStatus,
    supersedesIds:    safeParseArray(row.supersedesIds) as string[],
    duplicateOfId:    row.duplicateOfId,
    appliedEntityId:  row.appliedEntityId,
    appliedAt:        row.appliedAt,
    createdAt:        row.createdAt,
    updatedAt:        row.updatedAt,
  }
}

function safeParseArray(s: string): unknown[] {
  try { return JSON.parse(s) as unknown[] } catch { return [] }
}
function safeParseObj(s: string): Record<string, unknown> {
  try { return JSON.parse(s) as Record<string, unknown> } catch { return {} }
}
