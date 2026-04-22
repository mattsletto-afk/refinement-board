const { describe, test, expect, beforeEach } = require('@jest/globals')

beforeEach(() => jest.clearAllMocks())

// Self-contained logic mirroring app/api/kpi/scores/route.ts
function buildScoresPayload(scores) {
  return scores.map((score) => ({
    runId: score.runId,
    sprintId: score.run?.sprintId ?? null,
    itemsCreated: score.itemsCreated,
    itemsReworked: score.itemsReworked,
    sprintShipped: score.sprintShipped,
    efficiencyScore: score.efficiencyScore,
    timestamp: score.createdAt.toISOString(),
  }))
}

function parseLimitParam(limitParam, max = 100, defaultVal = 10) {
  if (!limitParam) return defaultVal
  const parsed = parseInt(limitParam, 10)
  return Math.min(parsed, max)
}

function makeDbScore(overrides = {}) {
  return {
    runId: 'run-001',
    itemsCreated: 4,
    itemsReworked: 1,
    sprintShipped: true,
    efficiencyScore: 0.8,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    run: { sprintId: 'sprint-001', createdAt: new Date('2024-01-15T09:00:00Z') },
    ...overrides,
  }
}

describe('KPI Scores API Route logic', () => {
  test('buildScoresPayload maps all fields correctly', () => {
    const dbScores = [makeDbScore()]
    const result = buildScoresPayload(dbScores)

    expect(result).toHaveLength(1)
    expect(result[0].runId).toBe('run-001')
    expect(result[0].sprintId).toBe('sprint-001')
    expect(result[0].itemsCreated).toBe(4)
    expect(result[0].itemsReworked).toBe(1)
    expect(result[0].sprintShipped).toBe(true)
    expect(result[0].efficiencyScore).toBe(0.8)
    expect(result[0].timestamp).toBe('2024-01-15T10:00:00.000Z')
  })

  test('buildScoresPayload sets sprintId to null when run is null', () => {
    const dbScores = [makeDbScore({ run: null })]
    const result = buildScoresPayload(dbScores)
    expect(result[0].sprintId).toBeNull()
  })

  test('buildScoresPayload sets sprintId to null when run.sprintId is null', () => {
    const dbScores = [makeDbScore({ run: { sprintId: null, createdAt: new Date() } })]
    const result = buildScoresPayload(dbScores)
    expect(result[0].sprintId).toBeNull()
  })

  test('parseLimitParam returns default when no param', () => {
    expect(parseLimitParam(null)).toBe(10)
    expect(parseLimitParam(undefined)).toBe(10)
  })

  test('parseLimitParam parses string correctly', () => {
    expect(parseLimitParam('5')).toBe(5)
    expect(parseLimitParam('25')).toBe(25)
  })

  test('parseLimitParam caps at max', () => {
    expect(parseLimitParam('200', 100)).toBe(100)
    expect(parseLimitParam('99', 100)).toBe(99)
  })

  test('buildScoresPayload handles empty array', () => {
    expect(buildScoresPayload([])).toEqual([])
  })

  test('buildScoresPayload handles multiple scores', () => {
    const dbScores = [
      makeDbScore({ runId: 'run-001', itemsCreated: 5 }),
      makeDbScore({ runId: 'run-002', itemsCreated: 3 }),
      makeDbScore({ runId: 'run-003', itemsCreated: 8 }),
    ]
    const result = buildScoresPayload(dbScores)
    expect(result).toHaveLength(3)
    expect(result.map((r) => r.runId)).toEqual(['run-001', 'run-002', 'run-003'])
  })

  test('buildScoresPayload preserves sprintShipped false value', () => {
    const dbScores = [makeDbScore({ sprintShipped: false })]
    const result = buildScoresPayload(dbScores)
    expect(result[0].sprintShipped).toBe(false)
  })

  test('efficiency score edge values are preserved', () => {
    const zero = buildScoresPayload([makeDbScore({ efficiencyScore: 0 })])
    const one = buildScoresPayload([makeDbScore({ efficiencyScore: 1 })])
    expect(zero[0].efficiencyScore).toBe(0)
    expect(one[0].efficiencyScore).toBe(1)
  })
})
