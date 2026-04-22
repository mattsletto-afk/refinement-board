import type { AgentCapacityProfile, AgentRole, EffortPoints } from './types'

// ── Role capacity profiles ────────────────────────────────────────────────────
// Delivery fraction = maximum fraction of nominal EP that can reach core delivery.
// These ceilings exist even in weeks with zero meetings — coordination tasks,
// passive review requests, and internal alignment always consume some capacity.

export const NOMINAL_WEEKLY_EP: EffortPoints = 20

export const ROLE_DEFAULTS: Record<AgentRole, Pick<AgentCapacityProfile, 'nominalWeeklyEP' | 'maxDeliveryFraction'>> = {
  delivery:    { nominalWeeklyEP: 20, maxDeliveryFraction: 0.75 },  // Up to 15 EP/week on delivery
  coordinator: { nominalWeeklyEP: 20, maxDeliveryFraction: 0.45 },  // Max 9 EP; rest is coordination
  reviewer:    { nominalWeeklyEP: 20, maxDeliveryFraction: 0.40 },  // Max 8 EP; review+approval load is high
  executive:   { nominalWeeklyEP: 20, maxDeliveryFraction: 0.20 },  // Max 4 EP; governance dominates
}

// ── Effective capacity calculation ────────────────────────────────────────────

export function computeEffectiveCapacity(params: {
  nominal: EffortPoints
  meetingCost: EffortPoints
  governanceCost: EffortPoints
  blockerDrag: EffortPoints
  switchingPenalty: EffortPoints
  unplannedWork: EffortPoints
}): EffortPoints {
  const { nominal, meetingCost, governanceCost, blockerDrag, switchingPenalty, unplannedWork } = params
  return Math.max(0, nominal - meetingCost - governanceCost - blockerDrag - switchingPenalty - unplannedWork)
}

// ── Delivery ceiling ──────────────────────────────────────────────────────────
// Even after computing effective capacity, delivery is capped by the role's
// maxDeliveryFraction of nominal. A coordinator cannot suddenly become a
// full delivery contributor just because their calendar is light.

export function computeDeliveryCeiling(profile: AgentCapacityProfile): EffortPoints {
  return profile.nominalWeeklyEP * profile.maxDeliveryFraction
}

// ── Utilisation ───────────────────────────────────────────────────────────────
// Utilisation measures how much of nominal capacity reached delivery.
// It is intentionally calculated against nominal (not effective) so that
// overhead costs are visible in the utilisation shortfall.

export function computeUtilisation(deliveryEP: EffortPoints, nominalEP: EffortPoints): number {
  if (nominalEP <= 0) return 0
  return Math.min(1, deliveryEP / nominalEP)
}

// ── Governance baseline by role ───────────────────────────────────────────────
// Minimum governance overhead even in a "quiet" week — status updates,
// email triage, brief check-ins, and async review requests never reach zero.

export const GOVERNANCE_BASELINE_EP: Record<AgentRole, EffortPoints> = {
  delivery:    0.5,
  coordinator: 2.0,
  reviewer:    1.5,
  executive:   4.0,
}

// ── Unplanned work baseline ───────────────────────────────────────────────────
// Expected unplanned EP per week at typical project health.
// Increases significantly during incidents, integration phases, or escalations.

export const UNPLANNED_BASELINE_EP: Record<AgentRole, EffortPoints> = {
  delivery:    1.0,
  coordinator: 0.5,
  reviewer:    0.5,
  executive:   1.0,
}
