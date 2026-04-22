import type { EffortPoints, ReworkDefinition, ReworkEvent, ReworkSeverity, TaskEconomics } from './types'

// ── Rework severity table ─────────────────────────────────────────────────────
//
// Severity 1 — Minor: A small correction; same task scope; no downstream impact.
//   Cause: typo, minor logic error, naming inconsistency.
//   Cost: 0.5× original effort. Progress rolls back ~10%.
//
// Severity 2 — Moderate: A meaningful fix within the current work item.
//   Cause: misunderstood requirements, skipped test coverage, shortcut under
//   deadline pressure that later breaks an integration.
//   Cost: 1.0× original effort. Progress rolls back ~25%.
//
// Severity 3 — Major: The work item must be substantially redone; downstream
//   tasks built on faulty assumptions are invalidated.
//   Cause: wrong technical approach, dependency misread, design handoff missed.
//   Cost: 2.0× original effort. Progress rolls back ~50%. Downstream tasks and
//   artifacts built on this work become invalid.
//
// Severity 4 — Critical: A foundational error requiring full redo plus
//   coordination across multiple agents to unblock the cascade.
//   Cause: integration assumption wrong, security flaw discovered in review,
//   compliance gap in accepted artifact.
//   Cost: 3.0× original effort. Progress resets to 'started'. All downstream
//   tasks invalidated. Delivery forecast shifts by ≥1 week.

export const REWORK_DEFINITIONS: Record<ReworkSeverity, ReworkDefinition> = {
  1: {
    severity: 1,
    label: 'Minor',
    effortMultiplier: 0.5,
    progressRegression: 10,
    invalidatesDownstream: false,
    invalidatesArtifacts: false,
    shiftsForecasts: false,
    causes: ['Typo or naming error', 'Minor logic correction', 'Formatting / style inconsistency'],
  },
  2: {
    severity: 2,
    label: 'Moderate',
    effortMultiplier: 1.0,
    progressRegression: 25,
    invalidatesDownstream: false,
    invalidatesArtifacts: false,
    shiftsForecasts: false,
    causes: ['Skipped test coverage under deadline pressure', 'Misunderstood acceptance criteria', 'Integration shortcut that broke later'],
  },
  3: {
    severity: 3,
    label: 'Major',
    effortMultiplier: 2.0,
    progressRegression: 50,
    invalidatesDownstream: true,
    invalidatesArtifacts: true,
    shiftsForecasts: true,
    causes: ['Wrong technical approach discovered in review', 'Dependency misread', 'Design handoff not received before work started'],
  },
  4: {
    severity: 4,
    label: 'Critical',
    effortMultiplier: 3.0,
    progressRegression: 75,
    invalidatesDownstream: true,
    invalidatesArtifacts: true,
    shiftsForecasts: true,
    causes: ['Integration assumption was wrong', 'Security flaw found post-acceptance', 'Compliance gap in a ratified artifact'],
  },
}

// ── Rework effort calculation ─────────────────────────────────────────────────

export function computeReworkEffort(originalEP: EffortPoints, severity: ReworkSeverity): EffortPoints {
  return originalEP * REWORK_DEFINITIONS[severity].effortMultiplier
}

// ── Apply rework to a task ────────────────────────────────────────────────────
// Returns a new TaskEconomics with progress rolled back and rework event recorded.
// Does NOT mutate the input.

// Rework regresses progress and resets actualEP to match the regressed state.
// The rework cost is tracked on the event itself and charged to the agent's
// capacity separately — it does not appear as forward progress on the task.
export function applyReworkToTask(task: TaskEconomics, event: ReworkEvent): TaskEconomics {
  const def = REWORK_DEFINITIONS[event.severity]
  const newProgress = Math.max(0, task.progressPct - def.progressRegression)
  const regressedActualEP = (newProgress / 100) * task.plannedEP

  return {
    ...task,
    actualEP: regressedActualEP,
    progressPct: newProgress,
    state: progressPctToState(newProgress),
    reworkEvents: [...task.reworkEvents, event],
    stateEnteredWeek: event.week,
  }
}

// ── Forecast shift from rework ────────────────────────────────────────────────
// Returns additional weeks slippage caused by a rework event, given the
// team's current effective weekly delivery EP.

export function reworkForecastSlip(
  reworkEffortEP: EffortPoints,
  teamWeeklyDeliveryEP: EffortPoints,
): number {
  if (teamWeeklyDeliveryEP <= 0) return 0
  return reworkEffortEP / teamWeeklyDeliveryEP
}

// ── Total rework cost across events ──────────────────────────────────────────

export function totalReworkEP(events: ReworkEvent[]): EffortPoints {
  return events.reduce((sum, e) => sum + e.reworkEffortEP, 0)
}

// ── Inline helper used by both rework and progress modules ───────────────────

export function progressPctToState(pct: number): TaskEconomics['state'] {
  if (pct <= 0)   return 'not-started'
  if (pct < 20)   return 'started'
  if (pct < 50)   return 'in-progress'
  if (pct < 80)   return 'substantial'
  if (pct < 100)  return 'review-ready'
  return 'accepted'
}
