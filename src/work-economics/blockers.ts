import type { ActiveBlocker, BlockerDefinition, BlockerSeverity, EffortPoints } from './types'

// ── Blocker severity table ────────────────────────────────────────────────────
//
// Soft blocker: Work can continue at reduced pace. Agent is waiting on a
//   decision or input but can make partial progress on adjacent parts.
//   EP loss = 30% of the blocked task's weekly allocation.
//   Adds 0.5 EP/week coordination overhead while active.
//   Typical resolution: 2-3 days.
//
// Hard blocker: Task cannot proceed at all until resolved. Agent must either
//   context-switch to other work (triggering a switching penalty) or wait.
//   EP loss = 100% of the blocked task's weekly allocation.
//   Adds 1.0 EP/week coordination overhead (status checks, escalation).
//   Typical resolution: 3-5 days.
//
// Systemic blocker: Affects multiple agents and tasks simultaneously.
//   An environment outage, external dependency failure, or process deadlock.
//   EP loss = 100% for each affected task across multiple agents.
//   Adds 2.0 EP/week coordination overhead per affected agent.
//   Contagious: resolving it requires structured coordination effort.
//   Typical resolution: 5-10 days.

export const BLOCKER_DEFINITIONS: Record<BlockerSeverity, BlockerDefinition> = {
  soft: {
    severity: 'soft',
    capacityBlockFraction: 0.30,
    coordinationOverheadEP: 0.50,
    typicalResolutionDays: 2.5,
    contagious: false,
  },
  hard: {
    severity: 'hard',
    capacityBlockFraction: 1.00,
    coordinationOverheadEP: 1.00,
    typicalResolutionDays: 4,
    contagious: false,
  },
  systemic: {
    severity: 'systemic',
    capacityBlockFraction: 1.00,
    coordinationOverheadEP: 2.00,
    typicalResolutionDays: 7.5,
    contagious: true,
  },
}

// ── Blocker drag per agent per week ──────────────────────────────────────────
// Computes total EP lost to blockers for a single agent in a given week.
// taskAllocationEP = the EP the agent had planned to spend on each blocked task.

export function computeBlockerDrag(
  blockers: ActiveBlocker[],
  agentId: string,
  week: number,
  taskAllocationEP: Record<string, EffortPoints>,
): EffortPoints {
  let drag = 0
  for (const blocker of blockers) {
    if (!isBlockerActive(blocker, week)) continue
    if (!blocker.affectedAgentIds.includes(agentId)) continue
    const def = BLOCKER_DEFINITIONS[blocker.severity]
    const taskEP = taskAllocationEP[blocker.taskId] ?? 0
    drag += taskEP * def.capacityBlockFraction + def.coordinationOverheadEP
  }
  return drag
}

// ── Blocker coordination overhead (separate from capacity drag) ───────────────
// The overhead cost of managing the blocker: status checks, escalation emails,
// workshops. Charged even if the agent switches to other tasks.

export function computeBlockerOverhead(
  blockers: ActiveBlocker[],
  agentId: string,
  week: number,
): EffortPoints {
  return blockers
    .filter(b => isBlockerActive(b, week) && b.affectedAgentIds.includes(agentId))
    .reduce((sum, b) => sum + BLOCKER_DEFINITIONS[b.severity].coordinationOverheadEP, 0)
}

// ── Blocker lifecycle helpers ─────────────────────────────────────────────────

export function isBlockerActive(blocker: ActiveBlocker, week: number): boolean {
  return blocker.startWeek <= week && (blocker.resolvedWeek === null || blocker.resolvedWeek > week)
}

export function resolveBlocker(blocker: ActiveBlocker, week: number): ActiveBlocker {
  return { ...blocker, resolvedWeek: week }
}

export function activeBlockersForTask(blockers: ActiveBlocker[], taskId: string, week: number): ActiveBlocker[] {
  return blockers.filter(b => b.taskId === taskId && isBlockerActive(b, week))
}

export function isTaskHardBlocked(blockers: ActiveBlocker[], taskId: string, week: number): boolean {
  return activeBlockersForTask(blockers, taskId, week).some(b => b.severity === 'hard' || b.severity === 'systemic')
}
