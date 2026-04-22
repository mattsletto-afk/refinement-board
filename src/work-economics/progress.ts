import type { EffortPoints, ProgressState, TaskEconomics } from './types'
import { progressPctToState } from './rework'

// ── Progress thresholds ───────────────────────────────────────────────────────
// These map effort consumption (as % of planned) to progress states.
// "review-ready" requires the full effort to be consumed; it does NOT advance
// to "accepted" automatically — a reviewer must explicitly apply review EP.

export const PROGRESS_THRESHOLDS: Record<ProgressState, { minPct: number; maxPct: number }> = {
  'not-started':  { minPct: 0,   maxPct: 0   },
  'started':      { minPct: 1,   maxPct: 19  },
  'in-progress':  { minPct: 20,  maxPct: 49  },
  'substantial':  { minPct: 50,  maxPct: 79  },
  'review-ready': { minPct: 80,  maxPct: 99  },
  'accepted':     { minPct: 100, maxPct: 100 },
  'done':         { minPct: 100, maxPct: 100 },
}

// ── Apply effort to a task ────────────────────────────────────────────────────
// Returns a new TaskEconomics with updated actualEP and progressPct.
// effortEP must be > 0 and will be capped so that actualEP never exceeds
// plannedEP (work beyond plan triggers a rework event, not silent over-progress).

export function applyEffort(task: TaskEconomics, effortEP: EffortPoints, week: number): TaskEconomics {
  if (task.state === 'accepted' || task.state === 'done') return task
  if (task.blockerIds.length > 0 && effortEP > 0) {
    // Hard-blocked tasks silently absorb coordination time but don't advance.
    // Caller is responsible for not passing effortEP for hard-blocked tasks;
    // this guard prevents accidental progress on a blocked item.
    return task
  }

  const newActualEP = Math.min(task.actualEP + effortEP, task.plannedEP)
  const rawPct = task.plannedEP > 0 ? (newActualEP / task.plannedEP) * 100 : 0
  // Cap at 99% — a task cannot reach 100% through effort alone; it needs review.
  const newPct = Math.min(rawPct, 99)
  const newState = progressPctToState(newPct)
  const stateChanged = newState !== task.state

  return {
    ...task,
    actualEP: newActualEP,
    progressPct: newPct,
    state: newState,
    stateEnteredWeek: stateChanged ? week : task.stateEnteredWeek,
  }
}

// ── Apply review to a task ────────────────────────────────────────────────────
// A reviewer applies review EP to move the task from review-ready to accepted.
// reviewEP is the cost to the reviewer; it does NOT advance the task's actualEP
// (the delivery work is already done — this is reviewer time, not builder time).

export function applyReview(task: TaskEconomics, week: number): TaskEconomics {
  if (task.state !== 'review-ready') return task
  return {
    ...task,
    progressPct: 100,
    state: 'accepted',
    stateEnteredWeek: week,
  }
}

// ── Close a task ──────────────────────────────────────────────────────────────

export function closeTask(task: TaskEconomics, week: number): TaskEconomics {
  if (task.state !== 'accepted') return task
  return { ...task, state: 'done', stateEnteredWeek: week }
}

// ── Effort remaining ──────────────────────────────────────────────────────────

export function remainingEffort(task: TaskEconomics): EffortPoints {
  return Math.max(0, task.plannedEP - task.actualEP)
}

// ── Forecast completion week ──────────────────────────────────────────────────
// Returns the projected week of completion given current pace.
// weeklyDeliveryEP = the agent's current average weekly delivery EP for this task.

export function forecastCompletionWeek(
  task: TaskEconomics,
  currentWeek: number,
  weeklyDeliveryEP: EffortPoints,
): number | null {
  if (task.state === 'done' || task.state === 'accepted') return currentWeek
  if (weeklyDeliveryEP <= 0) return null
  const weeksRemaining = remainingEffort(task) / weeklyDeliveryEP
  return currentWeek + Math.ceil(weeksRemaining)
}

// ── Variance record ───────────────────────────────────────────────────────────

export function computeVariance(params: {
  taskId: string
  week: number
  plannedEP: EffortPoints
  actualEP: EffortPoints
  prior: { cumulativeVariance: EffortPoints } | null
}): { weeklyVariance: EffortPoints; cumulativeVariance: EffortPoints } {
  const weeklyVariance = params.plannedEP - params.actualEP
  const prior = params.prior?.cumulativeVariance ?? 0
  return { weeklyVariance, cumulativeVariance: prior + weeklyVariance }
}
