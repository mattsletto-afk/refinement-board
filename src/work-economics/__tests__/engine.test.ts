import { describe, it, expect } from 'vitest'
import {
  computeWeekThroughput,
  computeForecast,
  stepTasks,
  applyReworkEvents,
  RULES,
} from '../engine'
import { computeSwitchingPenalty, SWITCHING_PROFILES } from '../switching'
import { computeBlockerDrag, isBlockerActive, isTaskHardBlocked } from '../blockers'
import { applyEffort, applyReview, remainingEffort, forecastCompletionWeek } from '../progress'
import { computeReworkEffort, totalReworkEP, REWORK_DEFINITIONS } from '../rework'
import { computeAgentMeetingCost, MEETING_COSTS } from '../meetings'
import type { ActiveBlocker, TaskEconomics, WeeklyCapacityUsage, ArtifactEconomics, ReworkEvent } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<TaskEconomics> = {}): TaskEconomics {
  return {
    taskId: 'task-1', title: 'Test task', ownerAgentId: 'alice',
    plannedEP: 10, actualEP: 0, state: 'not-started', progressPct: 0,
    reworkEvents: [], blockerIds: [], stateEnteredWeek: 1, downstreamTaskIds: [],
    ...overrides,
  }
}

function makeUsage(overrides: Partial<WeeklyCapacityUsage> = {}): WeeklyCapacityUsage {
  return {
    agentId: 'alice', week: 1, nominal: 20,
    meetingCost: 2, governanceCost: 1, blockerDrag: 0,
    switchingPenalty: 0, unplannedWork: 1, reworkCost: 0,
    effective: 16, deliveryEP: 10, utilisation: 0.5,
    breakdown: {
      delivery: 10, coordination: 2, reporting: 1,
      review: 0, rework: 0, unplanned: 1, blocked: 0,
    },
    ...overrides,
  }
}

function makeBlocker(overrides: Partial<ActiveBlocker> = {}): ActiveBlocker {
  return {
    id: 'b1', taskId: 'task-1', severity: 'hard',
    startWeek: 2, resolvedWeek: null,
    description: 'Test blocker', affectedAgentIds: ['alice'],
    ...overrides,
  }
}

// ── Meeting costs ─────────────────────────────────────────────────────────────

describe('computeAgentMeetingCost', () => {
  it('returns 0 for empty meeting list', () => {
    expect(computeAgentMeetingCost([], 'delivery')).toBe(0)
  })

  it('charges full cost for standup to all roles', () => {
    const cost = computeAgentMeetingCost(['daily-standup'], 'delivery')
    expect(cost).toBe(MEETING_COSTS['daily-standup'].totalEP)
  })

  it('charges observer fraction for non-full-cost roles', () => {
    // executive is not a full-cost role for weekly-review
    const fullCost = MEETING_COSTS['weekly-review'].totalEP
    const fraction = MEETING_COSTS['weekly-review'].observerFraction
    const isFullCostRole = MEETING_COSTS['weekly-review'].fullCostRoles.includes('executive')
    const cost = computeAgentMeetingCost(['weekly-review'], 'executive')
    if (!isFullCostRole) {
      expect(cost).toBeCloseTo(fullCost * fraction)
    } else {
      expect(cost).toBeCloseTo(fullCost)
    }
  })

  it('accumulates multiple meeting costs', () => {
    const single = computeAgentMeetingCost(['daily-standup'], 'delivery')
    const multi = computeAgentMeetingCost(['daily-standup', 'weekly-review'], 'delivery')
    expect(multi).toBeGreaterThan(single)
  })

  it('exec checkpoint is the most expensive per occurrence', () => {
    const execCost = MEETING_COSTS['executive-checkpoint'].totalEP
    const standupCost = MEETING_COSTS['daily-standup'].totalEP
    expect(execCost).toBeGreaterThan(standupCost)
  })
})

// ── Context switching ─────────────────────────────────────────────────────────

describe('computeSwitchingPenalty', () => {
  it('returns 0 for a single stream', () => {
    expect(computeSwitchingPenalty(1)).toBe(0)
  })

  it('returns 0 for 0 streams', () => {
    expect(computeSwitchingPenalty(0)).toBe(0)
  })

  it('penalty increases with more streams', () => {
    expect(computeSwitchingPenalty(2)).toBeLessThan(computeSwitchingPenalty(3))
    expect(computeSwitchingPenalty(3)).toBeLessThan(computeSwitchingPenalty(4))
  })

  it('5-stream penalty is severe', () => {
    expect(computeSwitchingPenalty(5)).toBeGreaterThanOrEqual(7)
  })

  it('extrapolates beyond 5 streams', () => {
    expect(computeSwitchingPenalty(6)).toBeGreaterThan(computeSwitchingPenalty(5))
  })

  it('all table profiles have increasing penalty', () => {
    for (let i = 1; i < SWITCHING_PROFILES.length; i++) {
      expect(SWITCHING_PROFILES[i].penaltyEP).toBeGreaterThanOrEqual(SWITCHING_PROFILES[i - 1].penaltyEP)
    }
  })
})

// ── Blockers ──────────────────────────────────────────────────────────────────

describe('blocker model', () => {
  it('isBlockerActive returns true when week is within range', () => {
    const b = makeBlocker({ startWeek: 2, resolvedWeek: null })
    expect(isBlockerActive(b, 2)).toBe(true)
    expect(isBlockerActive(b, 5)).toBe(true)
  })

  it('isBlockerActive returns false before blocker starts', () => {
    const b = makeBlocker({ startWeek: 3, resolvedWeek: null })
    expect(isBlockerActive(b, 2)).toBe(false)
  })

  it('isBlockerActive returns false on resolution week', () => {
    const b = makeBlocker({ startWeek: 2, resolvedWeek: 4 })
    expect(isBlockerActive(b, 4)).toBe(false)
  })

  it('hard blocker fully blocks task capacity', () => {
    expect(computeBlockerDrag([makeBlocker()], 'alice', 2, { 'task-1': 8 })).toBeGreaterThan(0)
  })

  it('soft blocker causes less drag than hard blocker', () => {
    const softDrag = computeBlockerDrag([makeBlocker({ severity: 'soft' })], 'alice', 2, { 'task-1': 8 })
    const hardDrag = computeBlockerDrag([makeBlocker({ severity: 'hard' })], 'alice', 2, { 'task-1': 8 })
    expect(softDrag).toBeLessThan(hardDrag)
  })

  it('agent not in affectedAgentIds pays no drag', () => {
    const drag = computeBlockerDrag([makeBlocker()], 'bob', 2, { 'task-1': 8 })
    expect(drag).toBe(0)
  })

  it('isTaskHardBlocked returns true for hard blocker on task', () => {
    expect(isTaskHardBlocked([makeBlocker()], 'task-1', 2)).toBe(true)
  })

  it('isTaskHardBlocked returns false for soft blocker', () => {
    expect(isTaskHardBlocked([makeBlocker({ severity: 'soft' })], 'task-1', 2)).toBe(false)
  })
})

// ── Rework ────────────────────────────────────────────────────────────────────

describe('rework model', () => {
  it('severity 1 costs 0.5× original EP', () => {
    expect(computeReworkEffort(10, 1)).toBe(5)
  })

  it('severity 4 costs 3× original EP', () => {
    expect(computeReworkEffort(10, 4)).toBe(30)
  })

  it('severity ≥ 3 invalidates downstream', () => {
    expect(REWORK_DEFINITIONS[3].invalidatesDownstream).toBe(true)
    expect(REWORK_DEFINITIONS[4].invalidatesDownstream).toBe(true)
    expect(REWORK_DEFINITIONS[2].invalidatesDownstream).toBe(false)
  })

  it('severity ≥ 3 shifts forecasts', () => {
    expect(REWORK_DEFINITIONS[3].shiftsForecasts).toBe(true)
  })

  it('totalReworkEP sums all event costs', () => {
    const events: ReworkEvent[] = [
      { id: 'r1', taskId: 't1', severity: 1, week: 2, originalEffortEP: 4, reworkEffortEP: 2, description: '', triggeredBy: '', downstreamTaskIds: [] },
      { id: 'r2', taskId: 't1', severity: 2, week: 3, originalEffortEP: 6, reworkEffortEP: 6, description: '', triggeredBy: '', downstreamTaskIds: [] },
    ]
    expect(totalReworkEP(events)).toBe(8)
  })

  it('applyReworkEvents invalidates artifacts for severity ≥ 3', () => {
    const artifact: ArtifactEconomics = {
      artifactId: 'art-1', artifactClass: 'planning', ownerAgentId: 'alice',
      creationEP: 2, maintenanceEP: 0.5, reviewEP: 1, state: 'in-progress',
      valid: true, lastUpdatedWeek: 1,
    }
    const event: ReworkEvent = {
      id: 'r1', taskId: 'task-1', severity: 3, week: 3,
      originalEffortEP: 8, reworkEffortEP: 16, description: '',
      triggeredBy: '', downstreamTaskIds: ['art-1'],
    }
    const { artifacts } = applyReworkEvents([makeTask()], [artifact], [event])
    expect(artifacts[0].valid).toBe(false)
  })
})

// ── Progress states ───────────────────────────────────────────────────────────

describe('applyEffort', () => {
  it('moves task from not-started to started', () => {
    const task = makeTask()
    const result = applyEffort(task, 1, 1)
    expect(result.state).toBe('started')
    expect(result.progressPct).toBeGreaterThan(0)
  })

  it('never advances past 99% without review', () => {
    const task = makeTask({ plannedEP: 10 })
    const result = applyEffort(task, 10, 1)
    expect(result.progressPct).toBeLessThanOrEqual(99)
    expect(result.state).toBe('review-ready')
  })

  it('does not advance a hard-blocked task', () => {
    const task = makeTask({ blockerIds: ['b1'] })
    const result = applyEffort(task, 5, 1)
    expect(result.actualEP).toBe(0)
    expect(result.state).toBe('not-started')
  })

  it('caps actualEP at plannedEP', () => {
    const task = makeTask({ plannedEP: 10 })
    const result = applyEffort(task, 20, 1)
    expect(result.actualEP).toBeLessThanOrEqual(10)
  })
})

describe('applyReview', () => {
  it('moves review-ready task to accepted', () => {
    const task = makeTask({ state: 'review-ready', progressPct: 95, actualEP: 9.5 })
    expect(applyReview(task, 2).state).toBe('accepted')
  })

  it('does not change state if task is not review-ready', () => {
    const task = makeTask({ state: 'in-progress', progressPct: 40 })
    expect(applyReview(task, 2).state).toBe('in-progress')
  })
})

describe('remainingEffort', () => {
  it('returns full planned EP when no work done', () => {
    expect(remainingEffort(makeTask({ plannedEP: 10, actualEP: 0 }))).toBe(10)
  })

  it('returns 0 when fully consumed', () => {
    expect(remainingEffort(makeTask({ plannedEP: 10, actualEP: 10 }))).toBe(0)
  })
})

// ── Throughput ────────────────────────────────────────────────────────────────

describe('computeWeekThroughput', () => {
  it('efficiency is deliveryEP / nominalEP', () => {
    const usages = [makeUsage({ nominal: 20, deliveryEP: 10 })]
    const result = computeWeekThroughput(1, usages, [makeTask()])
    expect(result.efficiency).toBe(0.5)
  })

  it('efficiency is 0 when nominalEP is 0', () => {
    const usages = [makeUsage({ nominal: 0, deliveryEP: 0 })]
    const result = computeWeekThroughput(1, usages, [])
    expect(result.efficiency).toBe(0)
  })

  it('counts completed tasks correctly', () => {
    const tasks = [
      makeTask({ state: 'accepted' }),
      makeTask({ taskId: 'task-2', state: 'in-progress' }),
      makeTask({ taskId: 'task-3', state: 'done' }),
    ]
    const result = computeWeekThroughput(1, [makeUsage()], tasks)
    expect(result.tasksCompleted).toBe(2)
  })
})

// ── Forecast ──────────────────────────────────────────────────────────────────

describe('computeForecast', () => {
  it('returns on-track when plan is met and no slippage', () => {
    const result = computeForecast({
      week: 2,
      originalTargetWeek: 5,
      totalPlannedEP: 40,
      totalActualEP: 16,
      teamWeeklyDeliveryEP: 12,
      pendingReworkEP: 0,
    })
    expect(result.confidence).toBe('on-track')
    expect(result.slippage).toBe(0)
  })

  it('returns off-track when slippage exceeds 1 week and variance is high', () => {
    const result = computeForecast({
      week: 3,
      originalTargetWeek: 4,
      totalPlannedEP: 40,
      totalActualEP: 8,   // Far behind — only 20% done vs ~75% planned
      teamWeeklyDeliveryEP: 6,
      pendingReworkEP: 10,
    })
    expect(result.confidence).not.toBe('on-track')
  })

  it('adds rework EP to remaining work for forecast', () => {
    const withRework = computeForecast({
      week: 2, originalTargetWeek: 4,
      totalPlannedEP: 20, totalActualEP: 8,
      teamWeeklyDeliveryEP: 6, pendingReworkEP: 12,
    })
    const noRework = computeForecast({
      week: 2, originalTargetWeek: 4,
      totalPlannedEP: 20, totalActualEP: 8,
      teamWeeklyDeliveryEP: 6, pendingReworkEP: 0,
    })
    expect(withRework.currentForecastWeek).toBeGreaterThan(noRework.currentForecastWeek)
  })

  it('slippage threshold rule is 20%', () => {
    expect(RULES.FORECAST_SLIP_THRESHOLD_PCT).toBe(20)
  })
})
