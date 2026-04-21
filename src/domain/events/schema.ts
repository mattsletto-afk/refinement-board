/**
 * Event schema definitions for the trigger engine.
 * Covers: sprint-boundary, blocker-resolved, scope-added
 */

export type EventType =
  | 'sprint-boundary'
  | 'blocker-resolved'
  | 'scope-added'
  // Phase 2 — self-building loop events
  | 'run.completed'
  | 'run.failed'
  | 'story.created'
  | 'story.unblocked'
  | 'pr.merged'
  | 'codegen.next-story'

export type EventStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'dead-lettered'
  | 'deduplicated'

export interface SprintBoundaryPayload {
  sprintId: string
  sprintName: string
  boundaryType: 'start' | 'end'
  projectId: string
  workstreamIds: string[]
}

export interface BlockerResolvedPayload {
  taskId: string
  workstreamId: string
  projectId: string
  previousStatus: string
  resolvedBy?: string
}

export interface ScopeAddedPayload {
  storyId?: string
  featureId?: string
  epicId?: string
  projectId: string
  workstreamId?: string
  addedBy?: string
}

// Phase 2 payloads
export interface RunCompletedPayload {
  projectId:   string
  runId:       string
  storyId?:    string
  commitSha?:  string
  branch?:     string
  autoApplied: number
  manualReview: number
}

export interface StoryEventPayload {
  projectId: string
  storyId:   string
  storyRank: number
  title:     string
}

export type EventPayload =
  | SprintBoundaryPayload
  | BlockerResolvedPayload
  | ScopeAddedPayload
  | RunCompletedPayload
  | StoryEventPayload
  | Record<string, unknown>

export interface SimulationEvent {
  id: string
  type: EventType
  payload: EventPayload
  idempotencyKey: string
  status: EventStatus
  retryCount: number
  maxRetries: number
  createdAt: Date
  processedAt?: Date
  failedAt?: Date
  errorMessage?: string
  simulationId?: string
}

export interface CreateEventInput {
  type: EventType
  payload: EventPayload
  idempotencyKey?: string
  maxRetries?: number
}

/**
 * Build a canonical idempotency key for an event.
 * Events with the same key within the dedup window are skipped.
 */
export function buildIdempotencyKey(type: EventType, payload: EventPayload): string {
  switch (type) {
    case 'sprint-boundary': {
      const p = payload as SprintBoundaryPayload
      return `sprint-boundary:${p.sprintId}:${p.boundaryType}`
    }
    case 'blocker-resolved': {
      const p = payload as BlockerResolvedPayload
      return `blocker-resolved:${p.taskId}`
    }
    case 'scope-added': {
      const p = payload as ScopeAddedPayload
      const scopeRef = p.storyId ?? p.featureId ?? p.epicId ?? 'unknown'
      return `scope-added:${p.projectId}:${scopeRef}`
    }
    case 'run.completed':
    case 'run.failed': {
      const p = payload as RunCompletedPayload
      return `${type}:${p.runId}`
    }
    case 'story.created':
    case 'story.unblocked':
    case 'codegen.next-story': {
      const p = payload as StoryEventPayload
      return `${type}:${p.storyId}`
    }
    case 'pr.merged': {
      const p = payload as Record<string, unknown>
      return `pr.merged:${p.prUrl ?? p.branch ?? Date.now()}`
    }
    default:
      return `${type}:${Date.now()}`
  }
}
