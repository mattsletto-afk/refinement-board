import type { UserStory as Story, Epic } from '@/app/generated/prisma'

export type ConflictStrategy = 'skip' | 'overwrite' | 'merge'

export interface JiraIssueImportRecord {
  pkey: string
  title: string
  status: string
  priority: string
  epicId: string | null
  featureId: string | null
  storyPoints: number | null
  description: string | null
  assignee: string | null
  labels: string[]
}

export interface JiraEpicImportRecord {
  pkey: string
  title: string
  status: string
  priority: string
  description: string | null
  labels: string[]
}

export type ConflictOutcome = 'inserted' | 'skipped' | 'overwritten' | 'merged'

export interface ConflictResolutionResult<T> {
  record: T
  outcome: ConflictOutcome
  pkey: string
}

export function resolveStoryConflict(
  incoming: JiraIssueImportRecord,
  existing: Story | null,
  strategy: ConflictStrategy
): { action: 'insert' | 'skip' | 'update'; data: Partial<JiraIssueImportRecord> } {
  if (existing === null) {
    return { action: 'insert', data: incoming }
  }

  if (strategy === 'skip') {
    return { action: 'skip', data: {} }
  }

  if (strategy === 'overwrite') {
    return { action: 'update', data: incoming }
  }

  return { action: 'update', data: mergeStoryFields(incoming, existing) }
}

export function resolveEpicConflict(
  incoming: JiraEpicImportRecord,
  existing: Epic | null,
  strategy: ConflictStrategy
): { action: 'insert' | 'skip' | 'update'; data: Partial<JiraEpicImportRecord> } {
  if (existing === null) {
    return { action: 'insert', data: incoming }
  }

  if (strategy === 'skip') {
    return { action: 'skip', data: {} }
  }

  if (strategy === 'overwrite') {
    return { action: 'update', data: incoming }
  }

  return { action: 'update', data: mergeEpicFields(incoming, existing) }
}

function mergeStoryFields(
  incoming: JiraIssueImportRecord,
  existing: Story
): Partial<JiraIssueImportRecord> {
  const merged: Partial<JiraIssueImportRecord> = {}

  const incomingTitle = incoming.title.trim()
  if (incomingTitle.length > 0 && incomingTitle !== existing.title) {
    merged.title = incomingTitle
  }

  const statusChanged = normalizeStatus(incoming.status) !== existing.status
  if (statusChanged) {
    merged.status = incoming.status
  }

  if (incoming.epicId !== null && incoming.epicId !== existing.epicId) {
    merged.epicId = incoming.epicId
  }

  if (incoming.featureId !== null && incoming.featureId !== existing.featureId) {
    merged.featureId = incoming.featureId
  }

  return merged
}

function mergeEpicFields(
  incoming: JiraEpicImportRecord,
  existing: Epic
): Partial<JiraEpicImportRecord> {
  const merged: Partial<JiraEpicImportRecord> = {}

  const incomingTitle = incoming.title.trim()
  if (incomingTitle.length > 0 && incomingTitle !== existing.title) {
    merged.title = incomingTitle
  }

  const statusChanged = normalizeStatus(incoming.status) !== existing.status
  if (statusChanged) {
    merged.status = incoming.status
  }

  const priorityChanged = normalizePriority(incoming.priority) !== existing.priority
  if (priorityChanged) {
    merged.priority = incoming.priority
  }

  return merged
}

export function normalizeStatus(jiraStatus: string): string {
  const s = jiraStatus.toLowerCase().trim()
  if (s === 'done' || s === 'closed' || s === 'resolved') return 'done'
  if (s === 'in progress' || s === 'in-progress' || s === 'active') return 'active'
  return 'backlog'
}

export function normalizePriority(jiraPriority: string): string {
  const p = jiraPriority.toLowerCase().trim()
  if (p === 'critical' || p === 'blocker') return 'critical'
  if (p === 'high' || p === 'major') return 'high'
  if (p === 'low' || p === 'minor' || p === 'trivial') return 'low'
  return 'medium'
}

export function extractPkey(title: string, fallbackPkey: string): string {
  const match = title.match(/^([A-Z][A-Z0-9]*-\d+)/)
  return match ? match[1] : fallbackPkey
}
