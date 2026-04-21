import type { RunScoreRecord } from './runScoring'

const MAX_FEEDBACK_TOKENS_APPROX = 500

/**
 * Builds a structured FEEDBACK_CONTEXT block to inject into agent prompts.
 * Returns empty string when no prior score exists (first run).
 * Stays under ~500 tokens by using a compact markdown table.
 */
export function buildFeedbackContext(priorScore: RunScoreRecord | null): string {
  if (!priorScore) return ''

  const lines = [
    '## FEEDBACK_CONTEXT (prior run)',
    '',
    `| Metric           | Value |`,
    `|------------------|-------|`,
    `| Items created    | ${priorScore.itemsCreated} |`,
    `| Items reworked   | ${priorScore.itemsReworked} |`,
    `| Items rejected   | ${priorScore.itemsRejected} |`,
    `| Sprint shipped   | ${priorScore.sprintShipped} |`,
    `| Tokens used      | ${priorScore.tokensUsed} |`,
    `| Efficiency score | ${priorScore.efficiencyScore}/100 |`,
    '',
    `> Run: ${priorScore.runId} — ${priorScore.createdAt.toISOString()}`,
    '',
    'Use this data to avoid repeating patterns that led to rework or rejection.',
    '',
  ]

  const block = lines.join('\n')

  // Safety check: ~4 chars per token rough estimate
  if (block.length / 4 > MAX_FEEDBACK_TOKENS_APPROX) {
    return lines.slice(0, 12).join('\n') + '\n'
  }

  return block
}
