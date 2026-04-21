import type { ScoreInputs, ScoreResult } from './types'

export function calculateScores(inputs: ScoreInputs): ScoreResult {
  const base = inputs.valueScore + inputs.riskScore + inputs.urgencyScore - inputs.effortScore
  return {
    baseScore: base,
    finalScore: base + inputs.meetingPoints,
  }
}

export function scoreTier(finalScore: number): 'green' | 'blue' | 'amber' | 'rose' {
  if (finalScore >= 13) return 'green'
  if (finalScore >= 9) return 'blue'
  if (finalScore >= 5) return 'amber'
  return 'rose'
}

export const SCORE_TIER_CLASSES: Record<ReturnType<typeof scoreTier>, string> = {
  green: 'bg-green-50 border-green-200 text-green-800',
  blue: 'bg-blue-50 border-blue-200 text-blue-800',
  amber: 'bg-amber-50 border-amber-200 text-amber-800',
  rose: 'bg-rose-50 border-rose-200 text-rose-800',
}
