import { describe, it, expect } from 'vitest'
import { buildFeedbackContext } from '../feedbackPrompt'
import type { RunScoreRecord } from '../runScoring'

const SAMPLE_SCORE: RunScoreRecord = {
  id: 'score-1',
  runId: 'run-abc',
  agentId: 'agent-planner',
  itemsCreated: 4,
  itemsReworked: 1,
  itemsRejected: 0,
  sprintShipped: 4,
  tokensUsed: 950,
  efficiencyScore: 80,
  createdAt: new Date('2026-04-18T12:00:00Z'),
}

describe('buildFeedbackContext', () => {
  it('returns empty string when no prior score (first run)', () => {
    expect(buildFeedbackContext(null)).toBe('')
  })

  it('includes FEEDBACK_CONTEXT heading', () => {
    const block = buildFeedbackContext(SAMPLE_SCORE)
    expect(block).toContain('FEEDBACK_CONTEXT')
  })

  it('includes all score metrics', () => {
    const block = buildFeedbackContext(SAMPLE_SCORE)
    expect(block).toContain('4')        // itemsCreated
    expect(block).toContain('80/100')   // efficiencyScore
    expect(block).toContain('950')      // tokensUsed
    expect(block).toContain('run-abc')  // runId
  })

  it('uses structured markdown table format (not freeform prose)', () => {
    const block = buildFeedbackContext(SAMPLE_SCORE)
    expect(block).toContain('|')
    expect(block).toContain('---')
  })

  it('stays under 500 tokens (approx 2000 chars)', () => {
    const block = buildFeedbackContext(SAMPLE_SCORE)
    expect(block.length).toBeLessThan(2000)
  })

  it('includes guidance to use history to avoid repeated mistakes', () => {
    const block = buildFeedbackContext(SAMPLE_SCORE)
    expect(block.toLowerCase()).toContain('rework')
  })
})
