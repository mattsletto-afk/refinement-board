// Types for run diffing and auditability

// ── Snapshot ──────────────────────────────────────────────────────────────────

export interface EntityRecord {
  id: string
  title: string
  status?: string
  priority?: string
  epicId?: string | null
  featureId?: string | null
  storyId?: string | null
}

export interface WorkstreamRecord {
  id: string
  name: string
}

export interface ProjectStateSnapshot {
  capturedAt: string
  epics:       EntityRecord[]
  features:    EntityRecord[]
  stories:     EntityRecord[]
  tasks:       EntityRecord[]
  risks:       EntityRecord[]
  milestones:  EntityRecord[]
  workstreams: WorkstreamRecord[]
}

// ── Diff ──────────────────────────────────────────────────────────────────────

export interface EntityDiff<T> {
  added:   T[]
  removed: T[]
  changed: { before: T; after: T }[]
}

export interface ProjectDiff {
  epics:       EntityDiff<EntityRecord>
  features:    EntityDiff<EntityRecord>
  stories:     EntityDiff<EntityRecord>
  tasks:       EntityDiff<EntityRecord>
  risks:       EntityDiff<EntityRecord>
  milestones:  EntityDiff<EntityRecord>
  workstreams: EntityDiff<WorkstreamRecord>
}

export interface SuggestionDiffEntry {
  action: string
  title: string
  detail?: string
}

export interface SuggestionDiff {
  created:        SuggestionDiffEntry[]
  refined:        SuggestionDiffEntry[]
  reparented:     SuggestionDiffEntry[]
  skippedApplied: SuggestionDiffEntry[]
  skippedDuplicate: SuggestionDiffEntry[]
  comments:       SuggestionDiffEntry[]
  failed:         SuggestionDiffEntry[]
}

export interface DiffCounts {
  epicsAdded:       number
  featuresAdded:    number
  storiesAdded:     number
  tasksAdded:       number
  risksAdded:       number
  milestonesAdded:  number
  workstreamsAdded: number
  storiesReparented: number
  storiesRefined:   number
  suggestionsCreated: number
  suggestionsSkipped: number
  suggestionsFailed:  number
}

export interface DiffSummary {
  project:     ProjectDiff
  suggestions: SuggestionDiff
  counts:      DiffCounts
  humanLines:  string[]
}

// ── Persisted record ──────────────────────────────────────────────────────────

export interface RunDiffRecord {
  id:          string
  agentRunId:  string
  projectId:   string
  beforeState: ProjectStateSnapshot
  afterState:  ProjectStateSnapshot
  diffSummary: DiffSummary
  humanSummary: string
  createdAt:   string
}
