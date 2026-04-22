import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/src/infrastructure/db/client', () => ({
  prisma: {
    agentMemory: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/src/infrastructure/db/client'
import { writeAgentMemory, readAgentMemory } from '@/src/infrastructure/db/agentMemory'

const mockCreate = prisma.agentMemory.create as ReturnType<typeof vi.fn>
const mockFindMany = prisma.agentMemory.findMany as ReturnType<typeof vi.fn>

const SAMPLE_RECORD = {
  id: 'mem_001',
  agentId: 'agent_planning',
  projectId: 'proj_001',
  runId: 'run_abc123',
  content: JSON.stringify({ appliedCount: 1, skippedCount: 0, summary: 'Good run' }),
  createdAt: new Date('2024-01-01T12:00:00Z'),
  schemaVersion: 1,
  retentionExpires: null,
}

describe('writeAgentMemory', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls prisma.agentMemory.create with correct payload', async () => {
    mockCreate.mockResolvedValueOnce(SAMPLE_RECORD)

    const result = await writeAgentMemory({
      agentId: 'agent_planning',
      projectId: 'proj_001',
      runId: 'run_abc123',
      content: SAMPLE_RECORD.content,
    })

    expect(mockCreate).toHaveBeenCalledOnce()
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        agentId: 'agent_planning',
        projectId: 'proj_001',
        content: SAMPLE_RECORD.content,
        runId: 'run_abc123',
      },
    })
    expect(result).toEqual(SAMPLE_RECORD)
  })

  it('returns the persisted record', async () => {
    mockCreate.mockResolvedValueOnce(SAMPLE_RECORD)
    const result = await writeAgentMemory({
      agentId: 'agent_planning',
      projectId: 'proj_001',
      runId: 'run_abc123',
      content: '{}',
    })
    expect(result.id).toBe('mem_001')
    expect(result.agentId).toBe('agent_planning')
  })

  it('propagates prisma errors', async () => {
    mockCreate.mockRejectedValueOnce(new Error('DB write failed'))
    await expect(
      writeAgentMemory({ agentId: 'a', projectId: 'p', content: '{}' }),
    ).rejects.toThrow('DB write failed')
  })
})

describe('readAgentMemory', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns records for a known agentId', async () => {
    mockFindMany.mockResolvedValueOnce([SAMPLE_RECORD])
    const results = await readAgentMemory('agent_planning')
    expect(results).toHaveLength(1)
    expect(results[0].runId).toBe('run_abc123')
  })

  it('returns empty array for unknown agentId (empty-history edge case)', async () => {
    mockFindMany.mockResolvedValueOnce([])
    const results = await readAgentMemory('agent_unknown')
    expect(results).toEqual([])
  })

  it('calls prisma.agentMemory.findMany with correct args', async () => {
    mockFindMany.mockResolvedValueOnce([])
    await readAgentMemory('agent_planning', 3)
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { agentId: 'agent_planning' },
      orderBy: { createdAt: 'desc' },
      take: 3,
    })
  })

  it('defaults limit to 5 when not specified', async () => {
    mockFindMany.mockResolvedValueOnce([])
    await readAgentMemory('agent_planning')
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    )
  })

  it('propagates prisma errors', async () => {
    mockFindMany.mockRejectedValueOnce(new Error('DB read failed'))
    await expect(readAgentMemory('agent_planning')).rejects.toThrow('DB read failed')
  })
})
