import type { EffortPoints, SwitchingProfile } from './types'

// ── Context switching penalty table ──────────────────────────────────────────
//
// Each time an agent must shift mental context between active work streams,
// they pay a re-orientation cost. The more streams active in a single week,
// the worse the drag — because each switch happens more frequently, and because
// the agent cannot hold full context for any stream simultaneously.
//
// "Active stream" = any task or initiative the agent is expected to meaningfully
// advance in a given week. Passively monitoring a task does not count.
//
// Penalty is the EP deducted from effective weekly capacity.

export const SWITCHING_PROFILES: SwitchingProfile[] = [
  { activeStreams: 1, penaltyEP: 0,  label: 'Single focus — no penalty' },
  { activeStreams: 2, penaltyEP: 1,  label: 'Dual stream — minor context drag' },
  { activeStreams: 3, penaltyEP: 3,  label: 'Three streams — meaningful fragmentation' },
  { activeStreams: 4, penaltyEP: 5,  label: 'Four streams — severely fragmented' },
  { activeStreams: 5, penaltyEP: 7,  label: 'Five or more streams — near-zero deep work' },
]

// ── Penalty lookup ────────────────────────────────────────────────────────────

export function computeSwitchingPenalty(activeStreams: number): EffortPoints {
  if (activeStreams <= 1) return 0
  // For counts beyond the table, extrapolate: each additional stream past 5 adds 2 EP
  const capped = Math.min(activeStreams, 5)
  const profile = SWITCHING_PROFILES.find(p => p.activeStreams === capped)
  const base = profile?.penaltyEP ?? 7
  const overflow = Math.max(0, activeStreams - 5)
  return base + overflow * 2
}

export function switchingLabel(activeStreams: number): string {
  const profile = SWITCHING_PROFILES.find(p => p.activeStreams === Math.min(activeStreams, 5))
  return profile?.label ?? 'Five or more streams — near-zero deep work'
}

// ── Safe stream count recommendation ─────────────────────────────────────────
// Returns the maximum number of active streams an agent can carry without
// losing more than the given fraction of their effective capacity to switching.

export function maxSafeStreams(penaltyFractionThreshold: number, nominalEP: EffortPoints): number {
  const penaltyCap = nominalEP * penaltyFractionThreshold
  for (const profile of SWITCHING_PROFILES) {
    if (profile.penaltyEP > penaltyCap) return Math.max(1, profile.activeStreams - 1)
  }
  return 5
}
