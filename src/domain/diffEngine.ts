import type {
  ProjectStateSnapshot, EntityRecord, WorkstreamRecord,
  EntityDiff, ProjectDiff, SuggestionDiff, SuggestionDiffEntry,
  DiffCounts, DiffSummary,
} from './diff'

// ── Generic entity diff ───────────────────────────────────────────────────────

function diffById<T extends { id: string }>(
  before: T[],
  after:  T[],
  changed: (a: T, b: T) => boolean = () => false
): EntityDiff<T> {
  const beforeMap = new Map(before.map(x => [x.id, x]))
  const afterMap  = new Map(after.map(x => [x.id, x]))

  const added:   T[] = []
  const removed: T[] = []
  const changedList: { before: T; after: T }[] = []

  for (const [id, b] of afterMap) {
    if (!beforeMap.has(id)) {
      added.push(b)
    } else {
      const a = beforeMap.get(id)!
      if (changed(a, b)) changedList.push({ before: a, after: b })
    }
  }
  for (const [id, a] of beforeMap) {
    if (!afterMap.has(id)) removed.push(a)
  }

  return { added, removed, changed: changedList }
}

function entityChanged(a: EntityRecord, b: EntityRecord): boolean {
  return a.status !== b.status || a.priority !== b.priority ||
    a.epicId !== b.epicId || a.featureId !== b.featureId || a.storyId !== b.storyId
}

// ── Project state diff ────────────────────────────────────────────────────────

export function diffProjectState(before: ProjectStateSnapshot, after: ProjectStateSnapshot): ProjectDiff {
  return {
    epics:       diffById(before.epics,       after.epics,       entityChanged),
    features:    diffById(before.features,    after.features,    entityChanged),
    stories:     diffById(before.stories,     after.stories,     entityChanged),
    tasks:       diffById(before.tasks,       after.tasks),
    risks:       diffById(before.risks,       after.risks,       entityChanged),
    milestones:  diffById(before.milestones,  after.milestones,  entityChanged),
    workstreams: diffById<WorkstreamRecord>(before.workstreams, after.workstreams),
  }
}

// ── Suggestion diff from apply results ───────────────────────────────────────

export interface ApplyResultLike {
  action: string
  title: string
  status: string
  detail?: string
}

export function diffFromApplyResults(results: ApplyResultLike[]): SuggestionDiff {
  const bucket = (statuses: string[]): SuggestionDiffEntry[] =>
    results
      .filter(r => statuses.includes(r.status))
      .map(r => ({ action: r.action, title: r.title, detail: r.detail }))

  return {
    created:         bucket(['created']),
    refined:         bucket(['refined']),
    reparented:      bucket(['reparented']),
    skippedApplied:  bucket(['skipped-applied']),
    skippedDuplicate:bucket(['skipped-duplicate', 'queued-for-review']),
    comments:        bucket(['comment', 'deferred-low']),
    failed:          bucket(['failed']),
  }
}

// ── Human-readable summary ────────────────────────────────────────────────────

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

export function buildHumanSummary(project: ProjectDiff, suggestions: SuggestionDiff): { counts: DiffCounts; humanLines: string[] } {
  const counts: DiffCounts = {
    epicsAdded:        project.epics.added.length,
    featuresAdded:     project.features.added.length,
    storiesAdded:      project.stories.added.length,
    tasksAdded:        project.tasks.added.length,
    risksAdded:        project.risks.added.length,
    milestonesAdded:   project.milestones.added.length,
    workstreamsAdded:  project.workstreams.added.length,
    storiesReparented: suggestions.reparented.length,
    storiesRefined:    suggestions.refined.length,
    suggestionsCreated: suggestions.created.length + suggestions.reparented.length + suggestions.refined.length,
    suggestionsSkipped: suggestions.skippedApplied.length + suggestions.skippedDuplicate.length,
    suggestionsFailed:  suggestions.failed.length,
  }

  const lines: string[] = []

  if (counts.epicsAdded)       lines.push(`${plural(counts.epicsAdded, 'epic')} created`)
  if (counts.featuresAdded)    lines.push(`${plural(counts.featuresAdded, 'feature')} created`)
  if (counts.storiesAdded)     lines.push(`${plural(counts.storiesAdded, 'story')} created`)
  if (counts.tasksAdded)       lines.push(`${plural(counts.tasksAdded, 'task')} created`)
  if (counts.risksAdded)       lines.push(`${plural(counts.risksAdded, 'risk')} added`)
  if (counts.milestonesAdded)  lines.push(`${plural(counts.milestonesAdded, 'milestone')} added`)
  if (counts.workstreamsAdded) lines.push(`${plural(counts.workstreamsAdded, 'workstream')} added`)
  if (counts.storiesReparented)lines.push(`${plural(counts.storiesReparented, 'story')} reparented`)
  if (counts.storiesRefined)   lines.push(`${plural(counts.storiesRefined, 'story')} refined`)
  if (counts.suggestionsSkipped > 0) {
    const dup  = suggestions.skippedDuplicate.length
    const appl = suggestions.skippedApplied.length
    if (dup)  lines.push(`${plural(dup, 'suggestion')} skipped (duplicate)`)
    if (appl) lines.push(`${plural(appl, 'suggestion')} skipped (already applied)`)
  }
  if (counts.suggestionsFailed)lines.push(`${plural(counts.suggestionsFailed, 'suggestion')} failed`)
  if (lines.length === 0)      lines.push('No changes applied')

  return { counts, humanLines: lines }
}

// ── Convenience: full diff summary ────────────────────────────────────────────

export function buildDiffSummary(
  before: ProjectStateSnapshot,
  after:  ProjectStateSnapshot,
  applyResults: ApplyResultLike[]
): DiffSummary {
  const project     = diffProjectState(before, after)
  const suggestions = diffFromApplyResults(applyResults)
  const { counts, humanLines } = buildHumanSummary(project, suggestions)
  return { project, suggestions, counts, humanLines }
}
