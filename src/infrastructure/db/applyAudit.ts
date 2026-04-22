import { prisma } from './client'
import type { ApplyAuditEntry } from '@/src/domain/autoApply/types'

export interface CreateAuditLogInput {
  projectId:    string
  suggestionId: string
  runId:        string | null
  entityId?:    string
  entityType:   string
  action:       string
  decision:     string
  blockReasons: string[]
  error?:       string
  appliedAt?:   Date
}

export async function saveAuditLog(input: CreateAuditLogInput): Promise<ApplyAuditEntry> {
  const row = await prisma.applyAuditLog.create({
    data: {
      projectId:    input.projectId,
      suggestionId: input.suggestionId,
      runId:        input.runId ?? null,
      entityId:     input.entityId ?? null,
      entityType:   input.entityType,
      action:       input.action,
      decision:     input.decision,
      blockReasons: JSON.stringify(input.blockReasons),
      error:        input.error ?? null,
      appliedAt:    input.appliedAt ?? null,
    },
  })
  return toEntry(row)
}

export async function getAuditLogsByProject(
  projectId: string,
  limit = 100
): Promise<ApplyAuditEntry[]> {
  const rows = await prisma.applyAuditLog.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return rows.map(toEntry)
}

export async function getAuditLogsBySuggestion(
  suggestionId: string
): Promise<ApplyAuditEntry[]> {
  const rows = await prisma.applyAuditLog.findMany({
    where: { suggestionId },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(toEntry)
}

function toEntry(row: {
  id: string; projectId: string; suggestionId: string; runId: string | null
  entityId: string | null; entityType: string; action: string; decision: string
  blockReasons: string; error: string | null; appliedAt: Date | null; createdAt: Date
}): ApplyAuditEntry {
  return {
    id:           row.id,
    projectId:    row.projectId,
    suggestionId: row.suggestionId,
    runId:        row.runId,
    entityId:     row.entityId,
    entityType:   row.entityType,
    action:       row.action,
    decision:     row.decision,
    blockReasons: JSON.parse(row.blockReasons) as string[],
    error:        row.error,
    appliedAt:    row.appliedAt?.toISOString() ?? null,
    createdAt:    row.createdAt.toISOString(),
  }
}
