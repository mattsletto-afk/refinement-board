import { describe, it, expect } from 'vitest'
import { buildMemoryContext, injectMemoryIntoPrompt } from '@/src/domain/agentMemoryPrompt'
import type { AgentMemoryRecord } from '@/src/infrastructure/db/agentMemory'

function makeRecord(overrides: Partial<AgentMemoryRecord> = {}): AgentMemoryRecord {
  return {
    id: 'mem_001',
    agentId: 'agent_planning',
    projectId: 'proj_001',
    runId: 'run_abc123',
    content: JSON.stringify({ appliedCount: 2, skippedCount: 0, summary: 'Created structure', actionsCount: 2 }),
    createdAt: new Date('2024-01-15T10:00:00Z'),
    schemaVersion: 1,
    retentionExpires: null,
    ...overrides,
  }
}

describe('buildMemoryContext', () => {
  it('returns empty string for empty records array', () => {
    expect(buildMemoryContext([])).toBe('')
  })

  it('returns empty string for null/undefined-like falsy input', () => {
    // @ts-expect-error testing runtime edge case
    expect(buildMemoryContext(null)).toBe('')
  })

  it('includes run ID and timestamp for each record', () => {
    const record = makeRecord()
    const ctx = buildMemoryContext([record])
    expect(ctx).toContain('run_abc123')
    expect(ctx).toContain('2024-01-15T10:00:00.000Z')
  })

  it('includes action count', () => {
    const record = makeRecord()
    const ctx = buildMemoryContext([record])
    expect(ctx).toContain('Actions taken: 2')
  })

  it('includes scorecard summary', () => {
    const record = makeRecord()
    const ctx = buildMemoryContext([record])
    expect(ctx).toContain('Created structure')
  })

  it('includes applied and skipped counts', () => {
    const record = makeRecord()
    const ctx = buildMemoryContext([record])
    expect(ctx).toContain('Applied: 2')
    expect(ctx).toContain('Skipped: 0')
  })

  it('handles malformed content gracefully (treats as plain text summary)', () => {
    const record = makeRecord({ content: 'not-json' })
    const ctx = buildMemoryContext([record])
    expect(ctx).toContain('not-json')
  })

  it('handles plain text content gracefully', () => {
    const record = makeRecord({ content: 'plain text scorecard' })
    const ctx = buildMemoryContext([record])
    expect(ctx).toContain('plain text scorecard')
  })

  it('renders multiple records', () => {
    const r1 = makeRecord({ runId: 'run_001' })
    const r2 = makeRecord({ runId: 'run_002' })
    const ctx = buildMemoryContext([r1, r2])
    expect(ctx).toContain('run_001')
    expect(ctx).toContain('run_002')
  })

  it('includes the evolution reminder line', () => {
    const ctx = buildMemoryContext([makeRecord()])
    expect(ctx).toContain('avoid repeating identical actions')
  })
})

describe('injectMemoryIntoPrompt', () => {
  it('returns original prompt unchanged when context is empty string', () => {
    const prompt = 'Do some planning.'
    expect(injectMemoryIntoPrompt(prompt, '')).toBe(prompt)
  })

  it('prepends memory context to prompt with separator', () => {
    const prompt = 'Do some planning.'
    const ctx = '## Prior Run Memory\nsome content'
    const result = injectMemoryIntoPrompt(prompt, ctx)
    expect(result).toContain('## Prior Run Memory')
    expect(result).toContain('Do some planning.')
    expect(result.indexOf('## Prior Run Memory')).toBeLessThan(result.indexOf('Do some planning.'))
  })

  it('includes separator line between memory and prompt', () => {
    const result = injectMemoryIntoPrompt('prompt', '## Memory')
    expect(result).toContain('---')
  })
})
