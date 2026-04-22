import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockUpsert, mockFindUnique, mockFindMany, mockAgentRunFindUnique } = vi.hoisted(() => ({
  mockUpsert: vi.fn(),
  mockFindUnique: vi.fn(),
  mockFindMany: vi.fn(),
  mockAgentRunFindUnique: vi.fn(),
}))

vi.mock('@/src/infrastructure/db/client', () => ({
  prisma: {
    runScore: {
      upsert: mockUpsert,
      findUnique: mockFindUnique,
      findMany: mockFindMany,
    },
    agentRun: {
      findUnique: mockAgentRunFindUnique,
    },
  },
}))

import {
  calculateEfficiencyScore,
  saveRunScore,
  getRunScore,
  getLatestScoreForAgent,
  scoreCompletedRun,
} from '../runScoring'

const SAMPLE_SCORE = {
  id: 'score-1',
  runId: 'run-1',
  agentId: 'agent-planner',
  itemsCreated: 5,
  itemsReworked: 1,
  itemsRejected: 2,
  sprintShipped: 5,
  tokensUsed: 1200,
  efficiencyScore: 43,
  createdAt: new Date('2026-04-19T10:00:00Z'),
}

describe('calculateEfficiencyScore', () => {
  it('returns 0 when no items processed', () => {
    expect(calculateEfficiencyScore(0, 0, 0)).toBe(0)
  })

  it('returns 100 for perfect run (created, no rework, no rejection)', () => {
    expect(calculateEfficiencyScore(10, 0, 0)).toBe(100)
  })

  it('returns 0 when all items rejected', () => {
    expect(calculateEfficiencyScore(0, 0, 5)).toBe(0)
  })

  it('calculates correctly with mixed outcomes', () => {
    // (5 - 1) / (5 + 2) * 100 = 4/7 * 100 ≈ 57
    expect(calculateEfficiencyScore(5, 1, 2)).toBe(57)
  })

  it('clamps to 0 floor when rework exceeds created', () => {
    expect(calculateEfficiencyScore(2, 5, 0)).toBe(0)
  })
})

describe('saveRunScore', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upserts with calculated efficiencyScore', async () => {
    mockUpsert.mockResolvedValueOnce(SAMPLE_SCORE)

    await saveRunScore({
      runId: 'run-1',
      agentId: 'agent-planner',
      itemsCreated: 5,
      itemsReworked: 1,
      itemsRejected: 2,
      sprintShipped: 5,
      tokensUsed: 1200,
    })

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { runId: 'run-1' },
        create: expect.objectContaining({ efficiencyScore: 57 }),
      }),
    )
  })
})

describe('getRunScore', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns score when found', async () => {
    mockFindUnique.mockResolvedValueOnce(SAMPLE_SCORE)
    const result = await getRunScore('run-1')
    expect(result).toEqual(SAMPLE_SCORE)
  })

  it('returns null when not found', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    expect(await getRunScore('missing')).toBeNull()
  })
})

describe('getLatestScoreForAgent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the most recent score for an agent', async () => {
    mockFindMany.mockResolvedValueOnce([SAMPLE_SCORE])
    const result = await getLatestScoreForAgent('agent-planner')
    expect(result).toEqual(SAMPLE_SCORE)
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { agentId: 'agent-planner' }, take: 1 }),
    )
  })

  it('returns null for unknown agent (empty-history edge case)', async () => {
    mockFindMany.mockResolvedValueOnce([])
    expect(await getLatestScoreForAgent('agent-unknown')).toBeNull()
  })
})

describe('scoreCompletedRun', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null for non-existent run', async () => {
    mockAgentRunFindUnique.mockResolvedValueOnce(null)
    expect(await scoreCompletedRun('missing')).toBeNull()
  })

  it('returns null when run is not complete', async () => {
    mockAgentRunFindUnique.mockResolvedValueOnce({ id: 'run-1', status: 'running', suggestions: [] })
    expect(await scoreCompletedRun('run-1')).toBeNull()
  })

  it('calculates score from run suggestions', async () => {
    mockAgentRunFindUnique.mockResolvedValueOnce({
      id: 'run-1',
      status: 'complete',
      agentType: 'project-planner',
      personaId: null,
      tokensUsed: 800,
      suggestions: [
        { type: 'create', status: 'applied' },
        { type: 'create', status: 'applied' },
        { type: 'update', status: 'applied' },
        { type: 'create', status: 'rejected' },
      ],
    })
    mockUpsert.mockResolvedValueOnce({ ...SAMPLE_SCORE, runId: 'run-1' })

    const score = await scoreCompletedRun('run-1')
    expect(score).not.toBeNull()
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          itemsCreated: 2,
          itemsReworked: 1,
          itemsRejected: 1,
          sprintShipped: 3,
          tokensUsed: 800,
        }),
      }),
    )
  })
})
