const { describe, test, expect, beforeEach } = require('@jest/globals')

beforeEach(() => jest.clearAllMocks())

// Mirror dashboard aggregation logic from KpiDashboard component
function computeSummary(scores) {
  const totalCreated = scores.reduce((sum, s) => sum + s.itemsCreated, 0)
  const totalReworked = scores.reduce((sum, s) => sum + s.itemsReworked, 0)
  const shippedCount = scores.filter((s) => s.sprintShipped).length
  const avgEfficiency =
    scores.length > 0
      ? scores.reduce((sum, s) => sum + s.efficiencyScore, 0) / scores.length
      : null
  return { totalCreated, totalReworked, shippedCount, avgEfficiency }
}

function mergeIncomingScore(existing, incoming) {
  const updated = [incoming, ...existing.filter((s) => s.runId !== incoming.runId)]
  return updated.slice(0, 10)
}

function makeScore(overrides = {}) {
  return {
    runId: `run-${Math.random()}`,
    sprintId: 'sprint-001',
    itemsCreated: 3,
    itemsReworked: 1,
    sprintShipped: true,
    efficiencyScore: 0.75,
    timestamp: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('KPI Dashboard summary logic', () => {
  test('empty scores returns zeros and null efficiency', () => {
    const result = computeSummary([])
    expect(result.totalCreated).toBe(0)
    expect(result.totalReworked).toBe(0)
    expect(result.shippedCount).toBe(0)
    expect(result.avgEfficiency).toBeNull()
  })

  test('single score sums correctly', () => {
    const result = computeSummary([
      makeScore({ itemsCreated: 5, itemsReworked: 2, sprintShipped: true, efficiencyScore: 0.8 }),
    ])
    expect(result.totalCreated).toBe(5)
    expect(result.totalReworked).toBe(2)
    expect(result.shippedCount).toBe(1)
    expect(result.avgEfficiency).toBeCloseTo(0.8)
  })

  test('multiple scores aggregate totals', () => {
    const scores = [
      makeScore({ itemsCreated: 4, itemsReworked: 1, sprintShipped: true, efficiencyScore: 0.9 }),
      makeScore({ itemsCreated: 2, itemsReworked: 3, sprintShipped: false, efficiencyScore: 0.5 }),
      makeScore({ itemsCreated: 6, itemsReworked: 0, sprintShipped: true, efficiencyScore: 1.0 }),
    ]
    const result = computeSummary(scores)
    expect(result.totalCreated).toBe(12)
    expect(result.totalReworked).toBe(4)
    expect(result.shippedCount).toBe(2)
    expect(result.avgEfficiency).toBeCloseTo(0.8)
  })

  test('shippedCount only counts sprintShipped=true', () => {
    const scores = [
      makeScore({ sprintShipped: false }),
      makeScore({ sprintShipped: false }),
      makeScore({ sprintShipped: true }),
    ]
    expect(computeSummary(scores).shippedCount).toBe(1)
  })

  test('avgEfficiency handles all-zero efficiency scores', () => {
    const scores = [
      makeScore({ efficiencyScore: 0 }),
      makeScore({ efficiencyScore: 0 }),
    ]
    expect(computeSummary(scores).avgEfficiency).toBe(0)
  })
})

describe('mergeIncomingScore', () => {
  test('new run is prepended to existing list', () => {
    const existing = [makeScore({ runId: 'run-old' })]
    const incoming = makeScore({ runId: 'run-new' })
    const result = mergeIncomingScore(existing, incoming)
    expect(result[0].runId).toBe('run-new')
    expect(result[1].runId).toBe('run-old')
  })

  test('deduplicates by runId — existing entry replaced', () => {
    const existing = [
      makeScore({ runId: 'run-dup', itemsCreated: 1 }),
      makeScore({ runId: 'run-other' }),
    ]
    const incoming = makeScore({ runId: 'run-dup', itemsCreated: 99 })
    const result = mergeIncomingScore(existing, incoming)
    const dup = result.find((s) => s.runId === 'run-dup')
    expect(dup.itemsCreated).toBe(99)
    expect(result.filter((s) => s.runId === 'run-dup')).toHaveLength(1)
  })

  test('list is capped at 10 items', () => {
    const existing = Array.from({ length: 10 }, (_, i) => makeScore({ runId: `run-${i}` }))
    const incoming = makeScore({ runId: 'run-new' })
    const result = mergeIncomingScore(existing, incoming)
    expect(result).toHaveLength(10)
    expect(result[0].runId).toBe('run-new')
  })

  test('empty existing list returns single-item list', () => {
    const incoming = makeScore({ runId: 'run-first' })
    const result = mergeIncomingScore([], incoming)
    expect(result).toHaveLength(1)
    expect(result[0].runId).toBe('run-first')
  })

  test('incoming event replaces old entry and moves to front', () => {
    const existing = [
      makeScore({ runId: 'run-a' }),
      makeScore({ runId: 'run-b' }),
      makeScore({ runId: 'run-c' }),
    ]
    const incoming = makeScore({ runId: 'run-b', efficiencyScore: 0.99 })
    const result = mergeIncomingScore(existing, incoming)
    expect(result[0].runId).toBe('run-b')
    expect(result[0].efficiencyScore).toBe(0.99)
    expect(result).toHaveLength(3)
  })
})
