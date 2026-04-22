import { describe, it, expect } from 'vitest'
import { classifyField, evaluateAssumption, evaluateBatch } from '../src/assumption-handler/policy'
import { FIXTURE_ASSUMPTIONS } from '../src/assumption-handler/fixtures'
import type { Assumption, AssumptionPolicyRule } from '../src/assumption-handler/types'

describe('classifyField', () => {
  it('classifies red fields correctly', () => {
    expect(classifyField('story.priority')).toBe('red')
    expect(classifyField('epic.title')).toBe('red')
    expect(classifyField('task.assignee')).toBe('red')
    expect(classifyField('milestone.dueDate')).toBe('red')
  })

  it('classifies yellow fields correctly', () => {
    expect(classifyField('story.title')).toBe('yellow')
    expect(classifyField('story.description')).toBe('yellow')
    expect(classifyField('story.epicId')).toBe('yellow')
    expect(classifyField('task.storyId')).toBe('yellow')
  })

  it('classifies green fields correctly', () => {
    expect(classifyField('task.title')).toBe('green')
    expect(classifyField('task.description')).toBe('green')
    expect(classifyField('risk.description')).toBe('green')
    expect(classifyField('milestone.title')).toBe('green')
  })

  it('defaults to yellow for unknown fields', () => {
    expect(classifyField('widget.unknownField')).toBe('yellow')
  })

  it('custom policies override defaults', () => {
    const custom: AssumptionPolicyRule[] = [{ pattern: 'task.title', level: 'red', autoApplyEligible: false, reason: 'override' }]
    expect(classifyField('task.title', custom)).toBe('red')
  })

  it('more specific pattern wins over wildcard', () => {
    // task.title (green, specificity 4) beats *.title (red, specificity 3)
    const custom: AssumptionPolicyRule[] = [{ pattern: '*.title', level: 'red', autoApplyEligible: false, reason: 'wildcard' }]
    expect(classifyField('task.title', custom)).toBe('green')
  })
})

describe('evaluateAssumption', () => {
  const base: Assumption = {
    id: '00000000-0000-0000-0000-000000000001',
    entityType: 'task',
    entityId: 'task-001',
    field: 'title',
    currentValue: '',
    proposedValue: 'New title',
    rationale: 'Field is empty and needs a value',
    confidence: 'high',
    status: 'unverified',
    verified: false,
    createdAt: '2026-04-18T10:00:00.000Z',
    updatedAt: '2026-04-18T10:00:00.000Z',
  }

  it('marks green+high+empty+unverified as eligible in simulation mode', () => {
    const result = evaluateAssumption(base, { simulationMode: 'enabled' })
    expect(result.eligible).toBe(true)
    expect(result.blockReasons).toHaveLength(0)
  })

  it('blocks when simulation mode is disabled', () => {
    const result = evaluateAssumption(base, { simulationMode: 'disabled' })
    expect(result.eligible).toBe(false)
    expect(result.blockReasons).toContain('simulation-mode-disabled')
  })

  it('blocks when confidence is low', () => {
    const result = evaluateAssumption({ ...base, confidence: 'low' }, { simulationMode: 'enabled' })
    expect(result.eligible).toBe(false)
    expect(result.blockReasons).toContain('confidence-too-low')
  })

  it('blocks when current value is not empty', () => {
    const result = evaluateAssumption({ ...base, currentValue: 'existing title' }, { simulationMode: 'enabled' })
    expect(result.eligible).toBe(false)
    expect(result.blockReasons).toContain('current-value-not-empty')
  })

  it('blocks when assumption is already verified', () => {
    const result = evaluateAssumption({ ...base, verified: true }, { simulationMode: 'enabled' })
    expect(result.eligible).toBe(false)
    expect(result.blockReasons).toContain('already-verified')
  })

  it('blocks when status is already resolved', () => {
    const result = evaluateAssumption({ ...base, status: 'verified' }, { simulationMode: 'enabled' })
    expect(result.eligible).toBe(false)
    expect(result.blockReasons).toContain('already-resolved')
  })

  it('blocks red fields', () => {
    const result = evaluateAssumption(
      { ...base, entityType: 'story', field: 'priority', currentValue: '' },
      { simulationMode: 'enabled' },
    )
    expect(result.eligible).toBe(false)
    expect(result.blockReasons).toContain('field-classified-red')
  })

  it('blocks yellow fields', () => {
    const result = evaluateAssumption(
      { ...base, entityType: 'story', field: 'epicId', currentValue: null },
      { simulationMode: 'enabled' },
    )
    expect(result.eligible).toBe(false)
    expect(result.blockReasons).toContain('field-classified-yellow')
  })

  it('classifies the assumption in the result', () => {
    const result = evaluateAssumption(base, { simulationMode: 'enabled' })
    expect(result.classification).toBe('green')
    expect(result.assumption.classification).toBe('green')
  })
})

describe('evaluateBatch', () => {
  it('evaluates all fixture assumptions', () => {
    const results = evaluateBatch(FIXTURE_ASSUMPTIONS, { simulationMode: 'enabled' })
    expect(results).toHaveLength(FIXTURE_ASSUMPTIONS.length)
  })

  it('only marks green+empty assumptions as eligible', () => {
    const results = evaluateBatch(FIXTURE_ASSUMPTIONS, { simulationMode: 'enabled' })
    const eligible = results.filter(r => r.eligible)
    // task.title (green, empty), task.description (green, null), risk.description (green, empty)
    expect(eligible.length).toBe(3)
    for (const e of eligible) {
      expect(e.classification).toBe('green')
    }
  })

  it('marks red/yellow fixture assumptions as ineligible', () => {
    const results = evaluateBatch(FIXTURE_ASSUMPTIONS, { simulationMode: 'enabled' })
    const ineligible = results.filter(r => !r.eligible)
    expect(ineligible.length).toBeGreaterThanOrEqual(2)
  })
})
