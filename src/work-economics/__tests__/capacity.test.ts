import { describe, it, expect } from 'vitest'
import {
  computeEffectiveCapacity,
  computeDeliveryCeiling,
  computeUtilisation,
  GOVERNANCE_BASELINE_EP,
  ROLE_DEFAULTS,
  NOMINAL_WEEKLY_EP,
} from '../capacity'
import type { AgentCapacityProfile } from '../types'

describe('computeEffectiveCapacity', () => {
  it('returns nominal when all deductions are zero', () => {
    const result = computeEffectiveCapacity({
      nominal: 20, meetingCost: 0, governanceCost: 0,
      blockerDrag: 0, switchingPenalty: 0, unplannedWork: 0,
    })
    expect(result).toBe(20)
  })

  it('reduces capacity by each deduction independently', () => {
    const result = computeEffectiveCapacity({
      nominal: 20, meetingCost: 2, governanceCost: 1.5,
      blockerDrag: 1, switchingPenalty: 1, unplannedWork: 1,
    })
    expect(result).toBeCloseTo(13.5)
  })

  it('never falls below 0', () => {
    const result = computeEffectiveCapacity({
      nominal: 10, meetingCost: 6, governanceCost: 6,
      blockerDrag: 3, switchingPenalty: 2, unplannedWork: 1,
    })
    expect(result).toBe(0)
  })

  it('handles partial deductions correctly', () => {
    const result = computeEffectiveCapacity({
      nominal: 20, meetingCost: 2.75, governanceCost: 0.5,
      blockerDrag: 0, switchingPenalty: 0, unplannedWork: 1.0,
    })
    expect(result).toBeCloseTo(15.75)
  })
})

describe('computeDeliveryCeiling', () => {
  it('delivery agent ceiling is 75% of nominal', () => {
    const profile: AgentCapacityProfile = {
      agentId: 'a', role: 'delivery', nominalWeeklyEP: 20, maxDeliveryFraction: 0.75,
    }
    expect(computeDeliveryCeiling(profile)).toBe(15)
  })

  it('executive agent ceiling is 20% of nominal', () => {
    const profile: AgentCapacityProfile = {
      agentId: 'e', role: 'executive', nominalWeeklyEP: 20, maxDeliveryFraction: 0.20,
    }
    expect(computeDeliveryCeiling(profile)).toBe(4)
  })
})

describe('computeUtilisation', () => {
  it('returns 1.0 when deliveryEP equals nominalEP', () => {
    expect(computeUtilisation(20, 20)).toBe(1)
  })

  it('returns 0.5 when deliveryEP is half nominal', () => {
    expect(computeUtilisation(10, 20)).toBe(0.5)
  })

  it('caps at 1.0 even if deliveryEP exceeds nominal', () => {
    expect(computeUtilisation(25, 20)).toBe(1)
  })

  it('returns 0 when nominalEP is 0', () => {
    expect(computeUtilisation(5, 0)).toBe(0)
  })
})

describe('ROLE_DEFAULTS', () => {
  it('all roles have nominalWeeklyEP of 20', () => {
    for (const role of Object.values(ROLE_DEFAULTS)) {
      expect(role.nominalWeeklyEP).toBe(NOMINAL_WEEKLY_EP)
    }
  })

  it('delivery role has highest delivery fraction', () => {
    expect(ROLE_DEFAULTS.delivery.maxDeliveryFraction).toBeGreaterThan(
      ROLE_DEFAULTS.coordinator.maxDeliveryFraction,
    )
  })

  it('executive has lowest delivery fraction', () => {
    expect(ROLE_DEFAULTS.executive.maxDeliveryFraction).toBeLessThan(
      ROLE_DEFAULTS.reviewer.maxDeliveryFraction,
    )
  })
})

describe('GOVERNANCE_BASELINE_EP', () => {
  it('executive has higher governance baseline than delivery', () => {
    expect(GOVERNANCE_BASELINE_EP.executive).toBeGreaterThan(GOVERNANCE_BASELINE_EP.delivery)
  })

  it('all baselines are positive', () => {
    for (const ep of Object.values(GOVERNANCE_BASELINE_EP)) {
      expect(ep).toBeGreaterThan(0)
    }
  })
})
