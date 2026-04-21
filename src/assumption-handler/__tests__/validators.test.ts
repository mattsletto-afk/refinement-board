import { describe, it, expect } from 'vitest'
import { parseAssumptionResponse, validateAssumptionResponse } from '../validators'
import type { AssumptionHandlerRequest, AssumptionHandlerResponse } from '../types'
import { FIXTURE_SIMULATION_REQUEST, FIXTURE_SIMULATION_RESPONSE } from '../fixtures'

const baseRequest: AssumptionHandlerRequest = FIXTURE_SIMULATION_REQUEST
const baseResponse: AssumptionHandlerResponse = FIXTURE_SIMULATION_RESPONSE

describe('parseAssumptionResponse', () => {
  it('returns success for valid JSON matching schema', () => {
    const result = parseAssumptionResponse(JSON.stringify(baseResponse))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.requestId).toBe(baseResponse.requestId)
      expect(result.data.assumptions.length).toBeGreaterThan(0)
    }
  })

  it('fails for invalid JSON', () => {
    const result = parseAssumptionResponse('not json at all')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain('not valid JSON')
  })

  it('fails for valid JSON that does not match schema', () => {
    const result = parseAssumptionResponse(JSON.stringify({ requestId: 'x', junk: true }))
    expect(result.success).toBe(false)
  })

  it('fails when synthetic is not literal true', () => {
    const bad = {
      ...baseResponse,
      assumptions: [{
        field: 'task.title',
        proposedValue: 'x',
        confidence: 'high',
        rationale: 'test',
        synthetic: false,   // should be literal true
        source: 'synthetic',
      }],
    }
    const result = parseAssumptionResponse(JSON.stringify(bad))
    expect(result.success).toBe(false)
  })

  it('fails for empty string', () => {
    expect(parseAssumptionResponse('').success).toBe(false)
  })

  it('fails when assumptions array contains extra unknown fields (strict mode)', () => {
    const bad = {
      ...baseResponse,
      assumptions: [{
        field: 'task.title',
        proposedValue: 'x',
        confidence: 'high',
        rationale: 'test',
        synthetic: true,
        source: 'synthetic',
        extraField: 'not allowed',
      }],
    }
    const result = parseAssumptionResponse(JSON.stringify(bad))
    expect(result.success).toBe(false)
  })
})

describe('validateAssumptionResponse', () => {
  it('passes for valid response matching request', () => {
    const result = validateAssumptionResponse(baseResponse, baseRequest)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('fails for requestId mismatch', () => {
    const mismatch = { ...baseResponse, requestId: 'req-different' }
    const result = validateAssumptionResponse(mismatch, baseRequest)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('requestId mismatch'))).toBe(true)
  })

  it('fails when a red field appears in assumptions', () => {
    const withRed: AssumptionHandlerResponse = {
      ...baseResponse,
      assumptions: [
        ...baseResponse.assumptions,
        {
          field: 'pricing.unit',
          proposedValue: 9.99,
          confidence: 'high',
          rationale: 'sneaked in',
          synthetic: true,
          source: 'synthetic',
        },
      ],
    }
    const result = validateAssumptionResponse(withRed, baseRequest)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('red-field assumption rejected'))).toBe(true)
  })

  it('fails when maxAssumptions limit is exceeded', () => {
    const request: AssumptionHandlerRequest = { ...baseRequest, maxAssumptions: 1 }
    const result = validateAssumptionResponse(baseResponse, request)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('exceeds limit'))).toBe(true)
  })

  it('fails when an assumption targets a verified field', () => {
    const request: AssumptionHandlerRequest = {
      ...baseRequest,
      existingVerifiedValues: { 'task.title': 'Real verified title' },
    }
    const result = validateAssumptionResponse(baseResponse, request)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('already verified'))).toBe(true)
  })

  it('counts auto-apply eligible items correctly', () => {
    const result = validateAssumptionResponse(baseResponse, baseRequest)
    // task.title and task.description are green with high/medium confidence and empty currentValue
    expect(result.autoApplyCount).toBeGreaterThanOrEqual(2)
  })

  it('counts blocked fields', () => {
    const result = validateAssumptionResponse(baseResponse, baseRequest)
    expect(result.blockedCount).toBe(baseResponse.blocked.length)
  })

  it('propagates response warnings', () => {
    const withWarning: AssumptionHandlerResponse = {
      ...baseResponse,
      warnings: ['something to review'],
    }
    const result = validateAssumptionResponse(withWarning, baseRequest)
    expect(result.warnings).toContain('something to review')
  })
})
