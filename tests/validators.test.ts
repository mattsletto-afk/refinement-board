import { describe, it, expect } from 'vitest'
import {
  validateAssumptionInput,
  validateAssumption,
  validatePatchPayload,
  parseEvaluationResponse,
  parsePatchJustificationResponse,
  validateBatch,
} from '../src/assumption-handler/validators'
import { FIXTURE_ASSUMPTIONS } from '../src/assumption-handler/fixtures'

describe('validateAssumptionInput', () => {
  const valid = {
    entityType: 'task',
    field: 'title',
    currentValue: '',
    proposedValue: 'New title',
    rationale: 'Field is empty and needs a value',
    confidence: 'high',
  }

  it('passes a valid input', () => {
    const result = validateAssumptionInput(valid)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('fails when entityType is missing', () => {
    const result = validateAssumptionInput({ ...valid, entityType: undefined })
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('fails when confidence is invalid', () => {
    const result = validateAssumptionInput({ ...valid, confidence: 'maybe' })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('confidence'))).toBe(true)
  })

  it('fails when field is empty string', () => {
    const result = validateAssumptionInput({ ...valid, field: '' })
    expect(result.valid).toBe(false)
  })

  it('accepts optional entityId', () => {
    const result = validateAssumptionInput({ ...valid, entityId: 'task-001' })
    expect(result.valid).toBe(true)
  })
})

describe('validateAssumption', () => {
  it('passes valid fixture assumptions', () => {
    for (const assumption of FIXTURE_ASSUMPTIONS) {
      const result = validateAssumption(assumption)
      expect(result.valid).toBe(true)
    }
  })

  it('warns when rationale is too short', () => {
    const a = { ...FIXTURE_ASSUMPTIONS[0], rationale: 'ok' }
    const result = validateAssumption(a)
    expect(result.valid).toBe(true)
    expect(result.warnings.some(w => w.includes('rationale'))).toBe(true)
  })

  it('warns when proposed equals current', () => {
    const a = { ...FIXTURE_ASSUMPTIONS[0], currentValue: 'same', proposedValue: 'same' }
    const result = validateAssumption(a)
    expect(result.valid).toBe(true)
    expect(result.warnings.some(w => w.includes('identical'))).toBe(true)
  })
})

describe('validatePatchPayload', () => {
  it('blocks empty title on task', () => {
    const result = validatePatchPayload('task', 'title', '')
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('empty'))).toBe(true)
  })

  it('passes non-empty title on task', () => {
    const result = validatePatchPayload('task', 'title', 'Valid title')
    expect(result.valid).toBe(true)
  })

  it('passes any value for non-required field', () => {
    const result = validatePatchPayload('task', 'notes', '')
    expect(result.valid).toBe(true)
  })

  it('warns on very long string values', () => {
    const longValue = 'x'.repeat(2500)
    const result = validatePatchPayload('task', 'description', longValue)
    expect(result.valid).toBe(true)
    expect(result.warnings.some(w => w.includes('long'))).toBe(true)
  })

  it('blocks empty title on risk', () => {
    const result = validatePatchPayload('risk', 'title', null)
    expect(result.valid).toBe(false)
  })
})

describe('parseEvaluationResponse', () => {
  const validResponse = JSON.stringify({
    reasonable: true,
    improves: true,
    risks: ['potential data loss'],
    suggestedConfidence: 'high',
    notes: 'Looks good',
  })

  it('parses a valid model response', () => {
    const result = parseEvaluationResponse(validResponse)
    expect(result.valid).toBe(true)
    expect(result.data?.reasonable).toBe(true)
    expect(result.data?.suggestedConfidence).toBe('high')
  })

  it('fails on invalid JSON', () => {
    const result = parseEvaluationResponse('not json at all')
    expect(result.valid).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('fails when required fields are missing', () => {
    const result = parseEvaluationResponse(JSON.stringify({ reasonable: true }))
    expect(result.valid).toBe(false)
  })

  it('fails when suggestedConfidence is not a valid enum', () => {
    const bad = JSON.stringify({ ...JSON.parse(validResponse), suggestedConfidence: 'maybe' })
    const result = parseEvaluationResponse(bad)
    expect(result.valid).toBe(false)
  })
})

describe('parsePatchJustificationResponse', () => {
  it('parses safe response', () => {
    const raw = JSON.stringify({ safe: true, concern: null })
    const result = parsePatchJustificationResponse(raw)
    expect(result.safe).toBe(true)
    expect(result.concern).toBeNull()
  })

  it('parses unsafe response with concern', () => {
    const raw = JSON.stringify({ safe: false, concern: 'This field is protected' })
    const result = parsePatchJustificationResponse(raw)
    expect(result.safe).toBe(false)
    expect(result.concern).toBe('This field is protected')
  })

  it('returns safe=false on invalid input', () => {
    const result = parsePatchJustificationResponse('garbage')
    expect(result.safe).toBe(false)
    expect(result.concern).toBeDefined()
  })
})

describe('validateBatch', () => {
  it('returns true when all inputs are valid', () => {
    const inputs = [
      { entityType: 'task', field: 'title', currentValue: '', proposedValue: 'T', rationale: 'needed', confidence: 'high' },
      { entityType: 'risk', field: 'description', currentValue: null, proposedValue: 'Desc', rationale: 'empty field', confidence: 'medium' },
    ]
    const { valid, results } = validateBatch(inputs)
    expect(valid).toBe(true)
    expect(results.every(r => r.valid)).toBe(true)
  })

  it('returns false when any input is invalid', () => {
    const inputs = [
      { entityType: 'task', field: 'title', currentValue: '', proposedValue: 'T', rationale: 'ok', confidence: 'high' },
      { entityType: '', field: '', currentValue: null, proposedValue: null, rationale: '', confidence: 'bad' },
    ]
    const { valid } = validateBatch(inputs)
    expect(valid).toBe(false)
  })
})
