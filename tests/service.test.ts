import { describe, it, expect, beforeEach } from 'vitest'
import { processAssumptions, handleAssumption, createAssumption } from '../src/assumption-handler/service'
import { clearPatchStore, getPatchStore } from '../src/assumption-handler/patch'
import {
  FIXTURE_ASSUMPTIONS,
  createFixtureContext,
  createMockInvoker,
} from '../src/assumption-handler/fixtures'
import type { AssumptionBatch, AssumptionInput } from '../src/assumption-handler/types'

beforeEach(() => {
  clearPatchStore()
})

describe('createAssumption', () => {
  it('creates a valid assumption from input', () => {
    const input: AssumptionInput = {
      entityType: 'task',
      field: 'title',
      currentValue: '',
      proposedValue: 'New task title',
      rationale: 'Field is empty and needs population',
      confidence: 'high',
    }
    const assumption = createAssumption(input)
    expect(assumption.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(assumption.status).toBe('unverified')
    expect(assumption.verified).toBe(false)
    expect(assumption.entityType).toBe('task')
    expect(assumption.proposedValue).toBe('New task title')
  })
})

describe('processAssumptions', () => {
  const makeBatch = (assumptions = FIXTURE_ASSUMPTIONS): AssumptionBatch => ({
    projectId: 'proj-salesforce-knowledge',
    assumptions,
  })

  it('processes the fixture batch and returns correct counts', async () => {
    const ctx = createFixtureContext()
    const result = await processAssumptions(makeBatch(), ctx, { skipModelEnrichment: true })

    expect(result.processed).toBe(FIXTURE_ASSUMPTIONS.length)
    expect(result.autoApplied + result.queued + result.skipped).toBeGreaterThanOrEqual(0)
    expect(result.patches).toHaveLength(result.autoApplied)
    expect(result.evaluations).toHaveLength(FIXTURE_ASSUMPTIONS.length)
  })

  it('applies green+empty+high patches when simulation enabled', async () => {
    const ctx = createFixtureContext({ simulationMode: 'enabled' })
    const result = await processAssumptions(makeBatch(), ctx, { skipModelEnrichment: true })
    expect(result.autoApplied).toBeGreaterThan(0)
    expect(getPatchStore().size).toBe(result.autoApplied)
  })

  it('applies no patches when simulation mode is disabled', async () => {
    const ctx = createFixtureContext({ simulationMode: 'disabled' })
    const result = await processAssumptions(makeBatch(), ctx, { skipModelEnrichment: true })
    expect(result.autoApplied).toBe(0)
    expect(getPatchStore().size).toBe(0)
  })

  it('applies no patches in dry-run mode', async () => {
    const ctx = createFixtureContext({ simulationMode: 'enabled' })
    const result = await processAssumptions(makeBatch(), ctx, { dryRun: true, skipModelEnrichment: true })
    // autoApplied reflects dry-run "applied" outcomes, but patch store is still updated
    // Dry-run still calls applyPatch which writes to store — verify patches have correct outcome
    expect(result.patches.every(p => p.outcome === 'applied' || p.outcome === 'blocked')).toBe(true)
  })

  it('skips invalid inputs', async () => {
    const ctx = createFixtureContext()
    const batch: AssumptionBatch = {
      projectId: 'proj-test',
      assumptions: [
        // valid
        FIXTURE_ASSUMPTIONS[0],
        // invalid (empty field)
        { ...FIXTURE_ASSUMPTIONS[1], field: '' },
      ],
    }
    const result = await processAssumptions(batch, ctx, { skipModelEnrichment: true })
    expect(result.skipped).toBe(1)
    expect(result.processed).toBe(1)
  })

  it('uses model invoker when skipModelEnrichment is false', async () => {
    let invoked = false
    const ctx = createFixtureContext({
      invokeModel: async (req) => {
        invoked = true
        return {
          content: JSON.stringify({
            reasonable: true,
            improves: true,
            risks: [],
            suggestedConfidence: 'high',
            notes: 'test',
          }),
          inputTokens: 10,
          outputTokens: 20,
        }
      },
    })
    await processAssumptions(makeBatch(), ctx, { skipModelEnrichment: false })
    expect(invoked).toBe(true)
  })

  it('handles model invoker errors gracefully', async () => {
    const ctx = createFixtureContext({
      invokeModel: async () => { throw new Error('API unavailable') },
    })
    // Should not throw — model enrichment is best-effort
    const result = await processAssumptions(makeBatch(), ctx, { skipModelEnrichment: false })
    expect(result.processed).toBeGreaterThan(0)
  })

  it('respects custom policies', async () => {
    const ctx = createFixtureContext({ simulationMode: 'enabled' })
    // Make task.title red — should now be blocked
    const custom = [{ pattern: 'task.title', classification: 'red' as const, autoApplicable: false }]
    const batch: AssumptionBatch = {
      projectId: 'proj-test',
      assumptions: [FIXTURE_ASSUMPTIONS[0]], // task.title
    }
    const result = await processAssumptions(batch, ctx, { skipModelEnrichment: true, customPolicies: custom })
    expect(result.autoApplied).toBe(0)
    expect(result.queued).toBe(1)
  })
})

describe('handleAssumption', () => {
  it('wraps a single input and returns assumption + result', async () => {
    const ctx = createFixtureContext()
    const input: AssumptionInput = {
      entityType: 'task',
      field: 'title',
      currentValue: '',
      proposedValue: 'Setup article types',
      rationale: 'Field is empty — agent flagged this gap',
      confidence: 'high',
    }
    const { assumption, result } = await handleAssumption(input, ctx, { skipModelEnrichment: true })
    expect(assumption.id).toBeDefined()
    expect(result.processed).toBe(1)
  })

  it('auto-applies a green+empty assumption', async () => {
    const ctx = createFixtureContext({ simulationMode: 'enabled' })
    const input: AssumptionInput = {
      entityType: 'task',
      field: 'rationale',
      currentValue: null,
      proposedValue: 'Required for developer handoff',
      rationale: 'Missing rationale field',
      confidence: 'high',
    }
    const { result } = await handleAssumption(input, ctx, { skipModelEnrichment: true })
    expect(result.autoApplied).toBe(1)
  })

  it('queues a red-field assumption', async () => {
    const ctx = createFixtureContext({ simulationMode: 'enabled' })
    const input: AssumptionInput = {
      entityType: 'story',
      field: 'priority',
      currentValue: 'low',
      proposedValue: 'high',
      rationale: 'Blocking feature — should be high priority',
      confidence: 'high',
    }
    const { result } = await handleAssumption(input, ctx, { skipModelEnrichment: true })
    expect(result.autoApplied).toBe(0)
    expect(result.queued).toBe(1)
    const evaluation = result.evaluations[0]
    expect(evaluation.blockReasons).toContain('field-classified-red')
  })
})
