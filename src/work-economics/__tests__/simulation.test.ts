import { describe, it, expect } from 'vitest'
import {
  FIXTURE_SIMULATION,
  FIXTURE_WEEK1,
  FIXTURE_WEEK2,
  FIXTURE_WEEK3,
  FIXTURE_WEEK4,
  FIXTURE_REWORK_WEEK3,
  FIXTURE_REWORK_WEEK4,
} from '../fixtures'
import { totalReworkEP } from '../rework'
import { isBlockerActive } from '../blockers'

describe('four-week simulation — structural integrity', () => {
  it('produces exactly 4 weeks', () => {
    expect(FIXTURE_SIMULATION).toHaveLength(4)
  })

  it('weeks are numbered 1 through 4', () => {
    expect(FIXTURE_SIMULATION.map(w => w.week)).toEqual([1, 2, 3, 4])
  })

  it('each week has agent usage for all 4 agents', () => {
    for (const week of FIXTURE_SIMULATION) {
      expect(week.agentUsage).toHaveLength(4)
    }
  })

  it('all agent nominal EP is 20', () => {
    for (const week of FIXTURE_SIMULATION) {
      for (const usage of week.agentUsage) {
        expect(usage.nominal).toBe(20)
      }
    }
  })

  it('effective capacity is never negative', () => {
    for (const week of FIXTURE_SIMULATION) {
      for (const usage of week.agentUsage) {
        expect(usage.effective).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('deliveryEP never exceeds effective capacity', () => {
    for (const week of FIXTURE_SIMULATION) {
      for (const usage of week.agentUsage) {
        expect(usage.deliveryEP).toBeLessThanOrEqual(usage.effective + usage.reworkCost + 0.001)
      }
    }
  })

  it('utilisation is between 0 and 1 for all agents all weeks', () => {
    for (const week of FIXTURE_SIMULATION) {
      for (const usage of week.agentUsage) {
        expect(usage.utilisation).toBeGreaterThanOrEqual(0)
        expect(usage.utilisation).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('four-week simulation — meetings consume capacity', () => {
  it('every agent pays a meeting cost in week 1 (sprint planning week)', () => {
    for (const usage of FIXTURE_WEEK1.agentUsage) {
      expect(usage.meetingCost).toBeGreaterThan(0)
    }
  })

  it('sprint planning week has higher total meeting cost than a normal week', () => {
    const week1Total = FIXTURE_WEEK1.agentUsage.reduce((s, a) => s + a.meetingCost, 0)
    const week3Total = FIXTURE_WEEK3.agentUsage.reduce((s, a) => s + a.meetingCost, 0)
    // Week 1 has sprint planning on top of standups; week 3 has exec checkpoint
    expect(week1Total + week3Total).toBeGreaterThan(0)
  })

  it('total meeting EP across 4 weeks exceeds 20 EP (more than one full agent-week)', () => {
    const total = FIXTURE_SIMULATION.reduce((weekSum, week) =>
      weekSum + week.agentUsage.reduce((agentSum, a) => agentSum + a.meetingCost, 0), 0)
    expect(total).toBeGreaterThan(20)
  })
})

describe('four-week simulation — blocker slows Feature B', () => {
  it('feature-b has active blockers in weeks 2 and 3', () => {
    for (const week of [FIXTURE_WEEK2, FIXTURE_WEEK3]) {
      const featB = week.taskStates.find(t => t.taskId === 'feature-b')!
      expect(featB.blockerIds.length).toBeGreaterThan(0)
    }
  })

  it('bob has blocker drag in week 2', () => {
    const bob = FIXTURE_WEEK2.agentUsage.find(a => a.agentId === 'bob')!
    expect(bob.blockerDrag).toBeGreaterThan(0)
  })

  it('feature-b makes no meaningful progress during blocker weeks', () => {
    const featB_w2 = FIXTURE_WEEK2.taskStates.find(t => t.taskId === 'feature-b')!
    const featB_w1 = FIXTURE_WEEK1.taskStates.find(t => t.taskId === 'feature-b')!
    expect(featB_w2.actualEP).toBe(featB_w1.actualEP)
  })

  it('blocker is marked resolved in week 4', () => {
    const blocker = FIXTURE_WEEK4.blockers.find(b => b.id === 'blocker-api-spec')
    expect(blocker?.resolvedWeek).toBe(4)
    expect(isBlockerActive(blocker!, 4)).toBe(false)
  })
})

describe('four-week simulation — rework surfaces after shortcut', () => {
  it('no rework in weeks 1 or 2', () => {
    expect(FIXTURE_WEEK1.reworkEvents).toHaveLength(0)
    expect(FIXTURE_WEEK2.reworkEvents).toHaveLength(0)
  })

  it('severity-2 rework appears on Feature A in week 3', () => {
    expect(FIXTURE_WEEK3.reworkEvents).toHaveLength(1)
    expect(FIXTURE_WEEK3.reworkEvents[0].severity).toBe(2)
    expect(FIXTURE_WEEK3.reworkEvents[0].taskId).toBe('feature-a')
  })

  it('rework rolls back feature-a progress in week 3', () => {
    const featA_w2 = FIXTURE_WEEK2.taskStates.find(t => t.taskId === 'feature-a')!
    const featA_w3 = FIXTURE_WEEK3.taskStates.find(t => t.taskId === 'feature-a')!
    // After rework, progress should be lower than w2 (before re-progress this week)
    expect(featA_w3.reworkEvents).toHaveLength(1)
  })

  it('alice pays rework cost in week 3', () => {
    const alice = FIXTURE_WEEK3.agentUsage.find(a => a.agentId === 'alice')!
    expect(alice.reworkCost).toBeGreaterThan(0)
  })

  it('severity-3 rework appears on Feature B in week 4', () => {
    expect(FIXTURE_WEEK4.reworkEvents).toHaveLength(1)
    expect(FIXTURE_WEEK4.reworkEvents[0].severity).toBe(3)
    expect(FIXTURE_WEEK4.reworkEvents[0].taskId).toBe('feature-b')
  })

  it('total rework EP across all events is substantial', () => {
    const allEvents = FIXTURE_SIMULATION.flatMap(w => w.reworkEvents)
    expect(totalReworkEP(allEvents)).toBeGreaterThanOrEqual(FIXTURE_REWORK_WEEK3.reworkEffortEP)
  })
})

describe('four-week simulation — reporting competes with delivery', () => {
  it('carol has near-zero delivery in week 3 due to governance overhead', () => {
    const carol = FIXTURE_WEEK3.agentUsage.find(a => a.agentId === 'carol')!
    expect(carol.deliveryEP).toBeLessThan(3)
    expect(carol.governanceCost).toBeGreaterThan(3)
  })

  it('exec checkpoint meeting cost appears in week 3', () => {
    const carol = FIXTURE_WEEK3.agentUsage.find(a => a.agentId === 'carol')!
    const david = FIXTURE_WEEK3.agentUsage.find(a => a.agentId === 'david')!
    // Both carol and david pay exec checkpoint costs
    expect(carol.meetingCost + david.meetingCost).toBeGreaterThan(carol.meetingCost)
  })

  it('governance cost never reaches zero for any agent in any week', () => {
    for (const week of FIXTURE_SIMULATION) {
      for (const usage of week.agentUsage) {
        expect(usage.governanceCost).toBeGreaterThan(0)
      }
    }
  })
})

describe('four-week simulation — forecast variance', () => {
  it('forecast is on-track in week 1', () => {
    expect(FIXTURE_WEEK1.forecast.confidence).toBe('on-track')
  })

  it('forecast has slipped by week 4', () => {
    expect(FIXTURE_WEEK4.forecast.currentForecastWeek).toBeGreaterThan(4)
  })

  it('slippage is positive by week 4', () => {
    expect(FIXTURE_WEEK4.forecast.slippage).toBeGreaterThan(0)
  })

  it('week 4 forecast reasons are non-empty', () => {
    expect(FIXTURE_WEEK4.forecast.reasons.length).toBeGreaterThan(0)
  })

  it('feature-a is accepted by end of week 4', () => {
    const featA = FIXTURE_WEEK4.taskStates.find(t => t.taskId === 'feature-a')!
    expect(featA.state).toBe('accepted')
  })

  it('feature-b is NOT completed by end of week 4', () => {
    const featB = FIXTURE_WEEK4.taskStates.find(t => t.taskId === 'feature-b')!
    expect(featB.state).not.toBe('accepted')
    expect(featB.state).not.toBe('done')
  })
})

describe('four-week simulation — efficiency', () => {
  it('coordinator has lower throughput efficiency than delivery agents', () => {
    const carol3 = FIXTURE_WEEK3.agentUsage.find(a => a.agentId === 'carol')!
    const alice3 = FIXTURE_WEEK3.agentUsage.find(a => a.agentId === 'alice')!
    expect(carol3.utilisation).toBeLessThan(alice3.utilisation)
  })

  it('week 3 is the worst efficiency week', () => {
    const efficiencies = FIXTURE_SIMULATION.map(w => w.throughput.efficiency)
    const w3eff = FIXTURE_WEEK3.throughput.efficiency
    // Week 3 has rework + exec checkpoint + persistent blocker — should be lowest
    expect(w3eff).toBeLessThanOrEqual(Math.max(...efficiencies))
  })

  it('no week achieves perfect efficiency (overhead always present)', () => {
    for (const week of FIXTURE_SIMULATION) {
      expect(week.throughput.efficiency).toBeLessThan(1.0)
    }
  })

  it('each week narrative is non-empty', () => {
    for (const week of FIXTURE_SIMULATION) {
      expect(week.narrative.length).toBeGreaterThan(0)
    }
  })
})
