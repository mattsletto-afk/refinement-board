import { describe, it, expect } from 'vitest'
import {
  matchPolicyRule,
  classifyField,
  isRedField,
  isGreenField,
  isYellowField,
  isAutoApplyEligible,
  DEFAULT_RULES,
} from '../policy'
import type { UnknownField } from '../types'

describe('matchPolicyRule', () => {
  it('returns green rule for task.title', () => {
    const rule = matchPolicyRule('task.title')
    expect(rule?.level).toBe('green')
    expect(rule?.autoApplyEligible).toBe(true)
  })

  it('returns yellow rule for project.teamSize', () => {
    const rule = matchPolicyRule('project.teamSize')
    expect(rule?.level).toBe('yellow')
    expect(rule?.autoApplyEligible).toBe(false)
  })

  it('returns red rule for pricing.unit via wildcard', () => {
    const rule = matchPolicyRule('pricing.unit')
    expect(rule?.level).toBe('red')
  })

  it('returns red rule for pricing.anything via wildcard', () => {
    expect(matchPolicyRule('pricing.annualCost')?.level).toBe('red')
    expect(matchPolicyRule('pricing.perSeat')?.level).toBe('red')
  })

  it('returns red rule for budget.* wildcard', () => {
    expect(matchPolicyRule('budget.total')?.level).toBe('red')
    expect(matchPolicyRule('budget.capex')?.level).toBe('red')
  })

  it('returns red for all blocked categories', () => {
    const blocked = ['compliance.policy', 'legal.terms', 'security.apiKey', 'kpi.conversion', 'revenue.q2']
    for (const path of blocked) {
      expect(matchPolicyRule(path)?.level).toBe('red')
    }
  })

  it('returns null for completely unknown field', () => {
    const rule = matchPolicyRule('unknown.field')
    expect(rule).toBeNull()
  })

  it('prefers more specific custom rule over default', () => {
    const custom = [{ pattern: 'task.title', level: 'red' as const, autoApplyEligible: false, reason: 'locked' }]
    const rule = matchPolicyRule('task.title', [...custom, ...DEFAULT_RULES])
    expect(rule?.level).toBe('red')
  })
})

describe('classifyField', () => {
  it('classifies task.title as green', () => expect(classifyField('task.title')).toBe('green'))
  it('classifies task.description as green', () => expect(classifyField('task.description')).toBe('green'))
  it('classifies persona.name as green', () => expect(classifyField('persona.name')).toBe('green'))
  it('classifies project.teamSize as yellow', () => expect(classifyField('project.teamSize')).toBe('yellow'))
  it('classifies project.timelineWeeks as yellow', () => expect(classifyField('project.timelineWeeks')).toBe('yellow'))
  it('classifies story.effort as yellow', () => expect(classifyField('story.effort')).toBe('yellow'))
  it('classifies revenue.ytd as red', () => expect(classifyField('revenue.ytd')).toBe('red'))
  it('defaults unknown field to yellow', () => expect(classifyField('widget.color')).toBe('yellow'))
})

describe('isRedField / isGreenField / isYellowField', () => {
  it('isRedField returns true for pricing.*', () => {
    expect(isRedField('pricing.unit')).toBe(true)
    expect(isRedField('budget.total')).toBe(true)
    expect(isRedField('kpi.retention')).toBe(true)
  })

  it('isRedField returns false for green field', () => {
    expect(isRedField('task.title')).toBe(false)
  })

  it('isGreenField returns true for task.title', () => {
    expect(isGreenField('task.title')).toBe(true)
    expect(isGreenField('persona.name')).toBe(true)
  })

  it('isGreenField returns false for yellow field', () => {
    expect(isGreenField('project.teamSize')).toBe(false)
  })

  it('isYellowField returns true for story.effort', () => {
    expect(isYellowField('story.effort')).toBe(true)
  })

  it('isYellowField returns true for unknown field', () => {
    expect(isYellowField('widget.color')).toBe(true)
  })
})

describe('isAutoApplyEligible', () => {
  const greenField: UnknownField = { path: 'task.title', severity: 'major', currentValue: '' }
  const yellowField: UnknownField = { path: 'project.teamSize', severity: 'major', currentValue: null }
  const redField: UnknownField = { path: 'pricing.unit', severity: 'critical', currentValue: null }
  const filledField: UnknownField = { path: 'task.title', severity: 'major', currentValue: 'existing title' }

  it('returns true for green + high confidence + empty + simulation', () => {
    expect(isAutoApplyEligible(greenField, 'high', 'simulation')).toBe(true)
  })

  it('returns true for green + medium confidence + simulation', () => {
    expect(isAutoApplyEligible(greenField, 'medium', 'simulation')).toBe(true)
  })

  it('returns true for green + high confidence + demo', () => {
    expect(isAutoApplyEligible(greenField, 'high', 'demo')).toBe(true)
  })

  it('returns true for green + high confidence + testing', () => {
    expect(isAutoApplyEligible(greenField, 'high', 'testing')).toBe(true)
  })

  it('returns false for production mode', () => {
    expect(isAutoApplyEligible(greenField, 'high', 'production')).toBe(false)
  })

  it('returns false for low confidence', () => {
    expect(isAutoApplyEligible(greenField, 'low', 'simulation')).toBe(false)
  })

  it('returns false for yellow field', () => {
    expect(isAutoApplyEligible(yellowField, 'high', 'simulation')).toBe(false)
  })

  it('returns false for red field', () => {
    expect(isAutoApplyEligible(redField, 'high', 'simulation')).toBe(false)
  })

  it('returns false when field already has a value', () => {
    expect(isAutoApplyEligible(filledField, 'high', 'simulation')).toBe(false)
  })

  it('returns false when field is in existingVerifiedValues', () => {
    expect(isAutoApplyEligible(greenField, 'high', 'simulation', [], { 'task.title': 'verified title' })).toBe(false)
  })
})
