import { describe, it, expect } from 'vitest'
import { classifyAction, classifyBatch } from '../classificationEngine'
import type { ClassifyInput } from '../classificationEngine'

const base: ClassifyInput = {
  action: 'create',
  entityType: 'story',
  title: 'Add login page',
  confidence: 'high',
}

describe('classifyAction', () => {
  it('returns safe for high-confidence story creation', () => {
    expect(classifyAction(base).verdict).toBe('safe')
  })

  it('BLOCK-001: blocks delete action', () => {
    const r = classifyAction({ ...base, action: 'delete' })
    expect(r.verdict).toBe('blocked')
    expect(r.ruleIds).toContain('BLOCK-001')
  })

  it('BLOCK-001: blocks delete when action is delete', () => {
    const r = classifyAction({ ...base, action: 'delete' })
    expect(r.verdict).toBe('blocked')
    expect(r.ruleIds).toContain('BLOCK-001')
  })

  it('BLOCK-002: blocks low-confidence epic creation', () => {
    const r = classifyAction({ ...base, action: 'create', entityType: 'epic', confidence: 'low' })
    expect(r.verdict).toBe('blocked')
    expect(r.ruleIds).toContain('BLOCK-002')
  })

  it('BLOCK-003: blocks epic reparent', () => {
    const r = classifyAction({ ...base, action: 'reparent', entityType: 'epic' })
    expect(r.verdict).toBe('blocked')
    expect(r.ruleIds).toContain('BLOCK-003')
  })

  it('BLOCK-004: blocks title over 500 chars', () => {
    const r = classifyAction({ ...base, title: 'x'.repeat(501) })
    expect(r.verdict).toBe('blocked')
    expect(r.ruleIds).toContain('BLOCK-004')
  })

  it('BLOCK-005: blocks script tag in title', () => {
    const r = classifyAction({ ...base, title: '<script>alert(1)</script>' })
    expect(r.verdict).toBe('blocked')
    expect(r.ruleIds).toContain('BLOCK-005')
  })

  it('BLOCK-005: blocks javascript: in description', () => {
    const r = classifyAction({ ...base, description: 'click javascript:void(0)' })
    expect(r.verdict).toBe('blocked')
  })

  it('REVIEW-001: flags low-confidence creation for review', () => {
    const r = classifyAction({ ...base, confidence: 'low' })
    expect(r.verdict).toBe('needs-review')
    expect(r.ruleIds).toContain('REVIEW-001')
  })

  it('REVIEW-002: flags risk entity updates for review', () => {
    const r = classifyAction({ ...base, action: 'update', entityType: 'risk' })
    expect(r.verdict).toBe('needs-review')
    expect(r.ruleIds).toContain('REVIEW-002')
  })

  it('REVIEW-003: flags story reparent for review', () => {
    const r = classifyAction({ ...base, action: 'reparent', entityType: 'story' })
    expect(r.verdict).toBe('needs-review')
    expect(r.ruleIds).toContain('REVIEW-003')
  })

  it('worst verdict wins: blocked beats needs-review', () => {
    // low-conf story creation (REVIEW-001) + delete (BLOCK-001)
    const r = classifyAction({ ...base, action: 'delete', confidence: 'low' })
    expect(r.verdict).toBe('blocked')
    expect(r.ruleIds).toContain('BLOCK-001')
  })

  it('returns multiple reasons when multiple rules fire', () => {
    // reparent epic triggers BLOCK-003 (epic reparent) and REVIEW-003 (reparent)
    const r = classifyAction({ ...base, action: 'reparent', entityType: 'epic' })
    expect(r.reasons.length).toBeGreaterThan(1)
  })
})

describe('classifyBatch', () => {
  it('counts verdicts correctly', () => {
    const inputs: ClassifyInput[] = [
      { ...base },                                               // safe
      { ...base, confidence: 'low' },                           // needs-review
      { ...base, action: 'delete' },                            // blocked
    ]
    const result = classifyBatch(inputs)
    expect(result.safe).toBe(1)
    expect(result.needsReview).toBe(1)
    expect(result.blocked).toBe(1)
    expect(result.results).toHaveLength(3)
  })

  it('attaches verdict to each result item', () => {
    const inputs: ClassifyInput[] = [base]
    const { results } = classifyBatch(inputs)
    expect(results[0].verdict).toBe('safe')
    expect(results[0].ruleIds).toBeDefined()
  })
})
