import type {
  ActiveBlocker,
  AgentCapacityProfile,
  AgentWeekInput,
  ArtifactEconomics,
  EffortPoints,
  ForecastConfidence,
  ForecastRecord,
  SimulationWeek,
  TaskEconomics,
  ThroughputSummary,
  WeeklyCapacityUsage,
  WorkCategory,
} from './types'
import { computeEffectiveCapacity, computeUtilisation, GOVERNANCE_BASELINE_EP, UNPLANNED_BASELINE_EP } from './capacity'
import { computeAgentMeetingCost } from './meetings'
import { computeBlockerDrag, isTaskHardBlocked } from './blockers'
import { computeSwitchingPenalty } from './switching'
import { applyEffort, applyReview } from './progress'
import { applyReworkToTask } from './rework'

// ── Ruleset ───────────────────────────────────────────────────────────────────
// These rules are applied by the simulation engine each week and define the
// relationship between inputs, overhead, and deliverable throughput.

export const RULES = {
  // A task cannot advance while a hard or systemic blocker is active.
  BLOCKED_TASKS_DO_NOT_PROGRESS: true,

  // Effective capacity can never fall below 0 EP.
  EFFECTIVE_CAPACITY_FLOOR_ZERO: true,

  // Delivery EP is capped by the agent's role delivery ceiling.
  DELIVERY_CAPPED_BY_ROLE_CEILING: true,

  // A task cannot reach 100% completion through effort alone — it requires
  // explicit review.
  REVIEW_REQUIRED_FOR_COMPLETION: true,

  // Rework severity ≥ 3 forces downstream tasks to be invalidated this week.
  REWORK_SEVERITY_3_INVALIDATES_DOWNSTREAM: true,

  // A forecast slips when cumulative delivery EP variance exceeds 20% of plan.
  FORECAST_SLIP_THRESHOLD_PCT: 20,

  // Systemic blockers add contagion overhead to all agents on affected tasks.
  SYSTEMIC_BLOCKERS_ARE_CONTAGIOUS: true,
} as const

// ── Agent week computation ────────────────────────────────────────────────────

export function computeAgentWeek(
  profile: AgentCapacityProfile,
  input: AgentWeekInput,
  blockers: ActiveBlocker[],
  taskAllocations: Record<string, EffortPoints>,
): WeeklyCapacityUsage {
  const meetingCost = computeAgentMeetingCost(input.meetings, profile.role)
  const governanceCost = Math.max(GOVERNANCE_BASELINE_EP[profile.role], input.governanceEP)
  const blockerDrag = computeBlockerDrag(blockers, input.agentId, 1 /* used as boolean */, taskAllocations)
    + computeBlockerDrag(blockers, input.agentId, 0, {})  // coordination overhead already in blockerDrag
  const switchingPenalty = computeSwitchingPenalty(input.activeStreams)
  const unplannedWork = Math.max(UNPLANNED_BASELINE_EP[profile.role], input.unplannedEP)

  const effective = computeEffectiveCapacity({
    nominal: profile.nominalWeeklyEP,
    meetingCost,
    governanceCost,
    blockerDrag: blockerDrag + input.reworkEP,  // rework competes for capacity
    switchingPenalty,
    unplannedWork,
  })

  const maxDelivery = profile.nominalWeeklyEP * profile.maxDeliveryFraction
  const deliveryEP = Math.min(input.deliveryEP, effective, maxDelivery)
  const utilisation = computeUtilisation(deliveryEP, profile.nominalWeeklyEP)

  const breakdown: Record<WorkCategory, EffortPoints> = {
    delivery:     deliveryEP,
    coordination: meetingCost,
    reporting:    governanceCost,
    review:       0,
    rework:       input.reworkEP,
    unplanned:    unplannedWork,
    blocked:      blockerDrag,
  }

  return {
    agentId: input.agentId,
    week: input.meetings.length >= 0 ? 1 : 1, // week is set by caller
    nominal: profile.nominalWeeklyEP,
    meetingCost,
    governanceCost,
    blockerDrag,
    switchingPenalty,
    unplannedWork,
    reworkCost: input.reworkEP,
    effective,
    deliveryEP,
    utilisation,
    breakdown,
  }
}

// ── Task progression step ─────────────────────────────────────────────────────

export function stepTasks(
  tasks: TaskEconomics[],
  agentDelivery: Array<{ agentId: string; taskId: string; effortEP: EffortPoints }>,
  reviewActions: Array<{ taskId: string }>,
  blockers: ActiveBlocker[],
  week: number,
): TaskEconomics[] {
  return tasks.map(task => {
    let updated = task

    // Apply blocker — hard-blocked tasks receive no progress
    const blocked = isTaskHardBlocked(blockers, task.taskId, week)
    if (!blocked) {
      const delivery = agentDelivery.find(d => d.taskId === task.taskId)
      if (delivery && delivery.effortEP > 0) {
        // Temporarily clear blockerIds so applyEffort doesn't guard
        const taskWithoutBlockers = { ...updated, blockerIds: [] }
        updated = { ...applyEffort(taskWithoutBlockers, delivery.effortEP, week), blockerIds: updated.blockerIds }
      }
    }

    // Apply reviews
    const reviewed = reviewActions.some(r => r.taskId === task.taskId)
    if (reviewed) {
      updated = applyReview(updated, week)
    }

    // Update blockerIds from active blockers
    const activeBlockerIds = blockers
      .filter(b => b.taskId === task.taskId && (b.resolvedWeek === null || b.resolvedWeek > week))
      .map(b => b.id)
    updated = { ...updated, blockerIds: activeBlockerIds }

    return updated
  })
}

// ── Rework application step ───────────────────────────────────────────────────

export function applyReworkEvents(
  tasks: TaskEconomics[],
  artifacts: ArtifactEconomics[],
  reworkEvents: Array<{ taskId: string; severity: 1 | 2 | 3 | 4; id: string; week: number; originalEffortEP: EffortPoints; reworkEffortEP: EffortPoints; description: string; triggeredBy: string; downstreamTaskIds: string[] }>,
): { tasks: TaskEconomics[]; artifacts: ArtifactEconomics[] } {
  let updatedTasks = [...tasks]
  let updatedArtifacts = [...artifacts]

  for (const event of reworkEvents) {
    const idx = updatedTasks.findIndex(t => t.taskId === event.taskId)
    if (idx !== -1) {
      updatedTasks[idx] = applyReworkToTask(updatedTasks[idx], event)
    }
    // Severity ≥ 3: invalidate downstream tasks' artifacts
    if (event.severity >= 3) {
      updatedArtifacts = updatedArtifacts.map(a =>
        event.downstreamTaskIds.includes(a.artifactId) ? { ...a, valid: false } : a,
      )
    }
  }
  return { tasks: updatedTasks, artifacts: updatedArtifacts }
}

// ── Throughput summary ────────────────────────────────────────────────────────

export function computeWeekThroughput(
  week: number,
  agentUsages: WeeklyCapacityUsage[],
  tasks: TaskEconomics[],
): ThroughputSummary {
  const nominalEP = agentUsages.reduce((s, a) => s + a.nominal, 0)
  const actualDeliveryEP = agentUsages.reduce((s, a) => s + a.deliveryEP, 0)
  const overheadEP = agentUsages.reduce((s, a) => s + a.meetingCost + a.governanceCost + a.switchingPenalty, 0)
  const reworkEP = agentUsages.reduce((s, a) => s + a.reworkCost, 0)
  const blockedEP = agentUsages.reduce((s, a) => s + a.blockerDrag, 0)
  const plannedDeliveryEP = agentUsages.reduce((s, a) => s + Math.min(a.nominal * 0.6, a.effective), 0)

  const tasksCompleted = tasks.filter(t => t.state === 'done' || t.state === 'accepted').length
  const tasksInFlight = tasks.filter(t => !['not-started', 'done', 'accepted'].includes(t.state)).length

  return {
    period: 'week',
    periodNumber: week,
    nominalEP,
    plannedDeliveryEP,
    actualDeliveryEP,
    overheadEP,
    reworkEP,
    blockedEP,
    tasksCompleted,
    tasksInFlight,
    efficiency: nominalEP > 0 ? actualDeliveryEP / nominalEP : 0,
  }
}

// ── Forecast computation ──────────────────────────────────────────────────────

export function computeForecast(params: {
  week: number
  originalTargetWeek: number
  totalPlannedEP: EffortPoints
  totalActualEP: EffortPoints
  teamWeeklyDeliveryEP: EffortPoints
  pendingReworkEP: EffortPoints
}): ForecastRecord {
  const { week, originalTargetWeek, totalPlannedEP, totalActualEP, teamWeeklyDeliveryEP, pendingReworkEP } = params
  const remainingEP = Math.max(0, totalPlannedEP - totalActualEP) + pendingReworkEP
  const weeksRemaining = teamWeeklyDeliveryEP > 0 ? Math.ceil(remainingEP / teamWeeklyDeliveryEP) : 99
  const currentForecastWeek = week + weeksRemaining
  const slippage = Math.max(0, currentForecastWeek - originalTargetWeek)

  let confidence: ForecastConfidence
  // Schedule variance: compare what SHOULD be done by now vs what IS done.
  // (totalPlannedEP - totalActualEP) alone just measures remaining work;
  // we need to weight it against where the schedule expects us to be.
  const expectedByNow = (week / originalTargetWeek) * totalPlannedEP
  const variancePct = totalPlannedEP > 0
    ? ((expectedByNow - totalActualEP) / totalPlannedEP) * 100
    : 0
  if (slippage === 0 && variancePct <= RULES.FORECAST_SLIP_THRESHOLD_PCT) {
    confidence = 'on-track'
  } else if (slippage <= 1 || variancePct <= 40) {
    confidence = 'at-risk'
  } else {
    confidence = 'off-track'
  }

  const reasons: string[] = []
  if (slippage > 0) reasons.push(`${slippage.toFixed(1)} week(s) of slippage accumulated`)
  if (pendingReworkEP > 0) reasons.push(`${pendingReworkEP.toFixed(1)} EP of pending rework`)
  if (variancePct > RULES.FORECAST_SLIP_THRESHOLD_PCT) reasons.push(`Delivery variance at ${variancePct.toFixed(0)}% of plan`)

  return { week, originalTargetWeek, currentForecastWeek, slippage, confidence, reasons }
}

// ── Assemble simulation week ──────────────────────────────────────────────────

export function assembleWeek(params: {
  week: number
  agentUsage: WeeklyCapacityUsage[]
  taskStates: TaskEconomics[]
  artifactStates: ArtifactEconomics[]
  reworkEvents: SimulationWeek['reworkEvents']
  blockers: ActiveBlocker[]
  originalTargetWeek: number
  totalPlannedEP: EffortPoints
  totalActualEP: EffortPoints
  pendingReworkEP: EffortPoints
  narrative: string[]
}): SimulationWeek {
  const throughput = computeWeekThroughput(params.week, params.agentUsage, params.taskStates)
  const forecast = computeForecast({
    week: params.week,
    originalTargetWeek: params.originalTargetWeek,
    totalPlannedEP: params.totalPlannedEP,
    totalActualEP: params.totalActualEP,
    teamWeeklyDeliveryEP: throughput.actualDeliveryEP,
    pendingReworkEP: params.pendingReworkEP,
  })

  return {
    week: params.week,
    agentUsage: params.agentUsage,
    taskStates: params.taskStates,
    artifactStates: params.artifactStates,
    reworkEvents: params.reworkEvents,
    blockers: params.blockers,
    throughput,
    forecast,
    narrative: params.narrative,
  }
}
