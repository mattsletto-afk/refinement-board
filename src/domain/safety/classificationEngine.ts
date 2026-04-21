/**
 * Safety Classification Engine
 * Classifies agent actions as safe / needs-review / blocked before execution.
 * Rules-first; LLM escalation only for ambiguous cases.
 */

import type { SuggestionAction, EntityType } from '@/src/infrastructure/db/suggestions'

export type SafetyVerdict = 'safe' | 'needs-review' | 'blocked'

export interface ClassifyInput {
  action:      SuggestionAction
  entityType:  EntityType
  title:       string
  description?: string
  confidence:  'high' | 'medium' | 'low'
  payload?:    Record<string, unknown>
}

export interface ClassifyResult {
  verdict:  SafetyVerdict
  reasons:  string[]
  ruleIds:  string[]
}

// ── Rule definitions ──────────────────────────────────────────────────────────

interface SafetyRule {
  id:      string
  verdict: SafetyVerdict
  test:    (input: ClassifyInput) => boolean
  reason:  string
}

const RULES: SafetyRule[] = [
  // Blocked: destructive actions on critical entities
  {
    id: 'BLOCK-001',
    verdict: 'blocked',
    test: ({ action }) => action === 'delete',
    reason: 'Agent-initiated deletions require human approval',
  },

  // Blocked: low-confidence structural changes
  {
    id: 'BLOCK-002',
    verdict: 'blocked',
    test: ({ action, entityType, confidence }) =>
      confidence === 'low' && action === 'create' && entityType === 'epic',
    reason: 'Low-confidence epic creation blocked — epics define project scope',
  },

  // Blocked: any action attempting to reparent an epic
  {
    id: 'BLOCK-003',
    verdict: 'blocked',
    test: ({ action, entityType }) => action === 'reparent' && entityType === 'epic',
    reason: 'Epic reparenting changes project structure — requires human review',
  },

  // Blocked: suspiciously long titles (prompt injection heuristic)
  {
    id: 'BLOCK-004',
    verdict: 'blocked',
    test: ({ title }) => title.length > 500,
    reason: 'Title exceeds 500 chars — possible prompt injection attempt',
  },

  // Blocked: titles containing script-like patterns
  {
    id: 'BLOCK-005',
    verdict: 'blocked',
    test: ({ title, description = '' }) => {
      const suspicious = /<script|javascript:|data:|eval\(|__proto__|constructor\[/i
      return suspicious.test(title) || suspicious.test(description)
    },
    reason: 'Title or description contains suspicious script-like content',
  },

  // Needs review: bulk creates (>5 items at once indicated by repeated calls)
  {
    id: 'REVIEW-001',
    verdict: 'needs-review',
    test: ({ action, confidence }) =>
      action === 'create' && confidence === 'low',
    reason: 'Low-confidence creation flagged for review',
  },

  // Needs review: update to a risk entity — risk status changes need oversight
  {
    id: 'REVIEW-002',
    verdict: 'needs-review',
    test: ({ action, entityType }) => action === 'update' && entityType === 'risk',
    reason: 'Risk record modifications require reviewer sign-off',
  },

  // Needs review: reparent of stories (structural change)
  {
    id: 'REVIEW-003',
    verdict: 'needs-review',
    test: ({ action }) => action === 'reparent',
    reason: 'Story reparenting changes backlog structure — needs review',
  },
]

// ── Classifier ────────────────────────────────────────────────────────────────

export function classifyAction(input: ClassifyInput): ClassifyResult {
  const triggered = RULES.filter(r => r.test(input))

  // Worst verdict wins
  const hasBlocked = triggered.some(r => r.verdict === 'blocked')
  const hasReview  = triggered.some(r => r.verdict === 'needs-review')

  const verdict: SafetyVerdict = hasBlocked ? 'blocked'
    : hasReview ? 'needs-review'
    : 'safe'

  return {
    verdict,
    reasons: triggered.map(r => r.reason),
    ruleIds: triggered.map(r => r.id),
  }
}

/** Classify a batch; return counts and any blocked items. */
export function classifyBatch(inputs: ClassifyInput[]): {
  safe:        number
  needsReview: number
  blocked:     number
  results:     Array<ClassifyInput & ClassifyResult>
} {
  let safe = 0, needsReview = 0, blocked = 0
  const results = inputs.map(input => {
    const result = classifyAction(input)
    if (result.verdict === 'safe')          safe++
    else if (result.verdict === 'needs-review') needsReview++
    else                                    blocked++
    return { ...input, ...result }
  })
  return { safe, needsReview, blocked, results }
}
