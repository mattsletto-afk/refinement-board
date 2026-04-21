import { describe, it, expect } from 'vitest'
import { prepare, handleModelResponse, execute } from '../service'
import {
  FIXTURE_SIMULATION_REQUEST,
  FIXTURE_SIMULATION_RESPONSE,
  FIXTURE_BACKLOG_REQUEST,
  FIXTURE_BACKLOG_RESPONSE,
  FIXTURE_DEMO_REQUEST,
  FIXTURE_DEMO_RESPONSE,
  createMockInvoker,
  createFailingInvoker,
  createRedFieldInvoker,
} from '../fixtures'

describe('prepare', () => {
  it('returns three non-empty prompt strings', () => {
    const result = prepare(FIXTURE_SIMULATION_REQUEST)
    expect(result.system.length).toBeGreaterThan(50)
    expect(result.developer.length).toBeGreaterThan(20)
    expect(result.user.length).toBeGreaterThan(20)
  })

  it('system prompt includes JSON-only enforcement', () => {
    const { system } = prepare(FIXTURE_SIMULATION_REQUEST)
    expect(system).toContain('JSON')
  })

  it('system prompt blocks red categories', () => {
    const { system } = prepare(FIXTURE_SIMULATION_REQUEST)
    expect(system.toLowerCase()).toMatch(/pricing|budget|compliance|legal|security/)
  })

  it('developer prompt includes the request appMode', () => {
    const { developer } = prepare(FIXTURE_SIMULATION_REQUEST)
    expect(developer).toContain('simulation')
  })

  it('developer prompt lists red fields found in request', () => {
    const { developer } = prepare(FIXTURE_SIMULATION_REQUEST)
    expect(developer).toContain('pricing.licensePerSeat')
  })

  it('developer prompt notes verified fields', () => {
    const { developer } = prepare(FIXTURE_SIMULATION_REQUEST)
    expect(developer).toContain('project.name')
  })

  it('user prompt contains requestId', () => {
    const { user } = prepare(FIXTURE_SIMULATION_REQUEST)
    expect(user).toContain(FIXTURE_SIMULATION_REQUEST.requestId)
  })

  it('user prompt ends with schema instruction', () => {
    const { user } = prepare(FIXTURE_SIMULATION_REQUEST)
    expect(user).toContain('Return only JSON matching the AssumptionHandlerResponse schema')
  })

  it('throws for invalid request', () => {
    expect(() => prepare({ requestId: '', appMode: 'simulation', fields: [], context: {} } as never)).toThrow()
  })
})

describe('handleModelResponse', () => {
  it('returns response, patch, and validation for valid output', () => {
    const result = handleModelResponse(
      FIXTURE_SIMULATION_REQUEST,
      JSON.stringify(FIXTURE_SIMULATION_RESPONSE),
    )
    expect(result.response.requestId).toBe(FIXTURE_SIMULATION_REQUEST.requestId)
    expect(result.patch.requiresReview).toBe(true)
    expect(result.patch.items.length).toBeGreaterThan(0)
    expect(result.validation.valid).toBe(true)
  })

  it('produces patch with correct item count', () => {
    const result = handleModelResponse(
      FIXTURE_SIMULATION_REQUEST,
      JSON.stringify(FIXTURE_SIMULATION_RESPONSE),
    )
    expect(result.patch.items.length).toBe(FIXTURE_SIMULATION_RESPONSE.assumptions.length)
  })

  it('marks auto-apply eligible items correctly', () => {
    const result = handleModelResponse(
      FIXTURE_SIMULATION_REQUEST,
      JSON.stringify(FIXTURE_SIMULATION_RESPONSE),
    )
    const autoItems = result.patch.items.filter(i => !i.requiresReview)
    expect(autoItems.length).toBe(result.validation.autoApplyCount)
  })

  it('returns empty patch safely when response has no assumptions', () => {
    const emptyResponse = {
      ...FIXTURE_SIMULATION_RESPONSE,
      assumptions: [],
      synthetic: [],
    }
    const result = handleModelResponse(FIXTURE_SIMULATION_REQUEST, JSON.stringify(emptyResponse))
    expect(result.patch.items).toHaveLength(0)
    expect(result.patch.autoApplyEligible).toBe(false)
  })

  it('throws for unparseable output', () => {
    expect(() =>
      handleModelResponse(FIXTURE_SIMULATION_REQUEST, 'not json'),
    ).toThrow(/parse failed/)
  })

  it('throws for red-field assumption in output', () => {
    const redResponse = JSON.stringify({
      ...FIXTURE_SIMULATION_RESPONSE,
      assumptions: [{
        field: 'pricing.unit',
        proposedValue: 9.99,
        confidence: 'high',
        rationale: 'red field attempt',
        synthetic: true,
        source: 'synthetic',
      }],
    })
    expect(() => handleModelResponse(FIXTURE_SIMULATION_REQUEST, redResponse)).toThrow(/validation failed/)
  })
})

describe('execute', () => {
  it('calls invoker and returns HandleResult for simulation fixture', async () => {
    const result = await execute(FIXTURE_SIMULATION_REQUEST, createMockInvoker(FIXTURE_SIMULATION_RESPONSE))
    expect(result.validation.valid).toBe(true)
    expect(result.patch.requestId).toBe(FIXTURE_SIMULATION_REQUEST.requestId)
  })

  it('calls invoker and returns HandleResult for backlog fixture', async () => {
    const result = await execute(FIXTURE_BACKLOG_REQUEST, createMockInvoker(FIXTURE_BACKLOG_RESPONSE))
    expect(result.validation.valid).toBe(true)
    expect(result.patch.items.length).toBe(FIXTURE_BACKLOG_RESPONSE.assumptions.length)
  })

  it('calls invoker and returns HandleResult for demo fixture', async () => {
    const result = await execute(FIXTURE_DEMO_REQUEST, createMockInvoker(FIXTURE_DEMO_RESPONSE))
    expect(result.validation.valid).toBe(true)
  })

  it('throws when invoker returns invalid JSON', async () => {
    await expect(execute(FIXTURE_SIMULATION_REQUEST, createFailingInvoker())).rejects.toThrow()
  })

  it('throws when invoker returns red-field assumption', async () => {
    const invoker = createRedFieldInvoker(FIXTURE_SIMULATION_REQUEST.requestId)
    await expect(execute(FIXTURE_SIMULATION_REQUEST, invoker)).rejects.toThrow()
  })

  it('patch.requiresReview is always true', async () => {
    const result = await execute(FIXTURE_SIMULATION_REQUEST, createMockInvoker(FIXTURE_SIMULATION_RESPONSE))
    expect(result.patch.requiresReview).toBe(true)
  })

  it('all patch items are marked synthetic', async () => {
    const result = await execute(FIXTURE_SIMULATION_REQUEST, createMockInvoker(FIXTURE_SIMULATION_RESPONSE))
    for (const item of result.patch.items) {
      expect(item.synthetic).toBe(true)
    }
  })
})
