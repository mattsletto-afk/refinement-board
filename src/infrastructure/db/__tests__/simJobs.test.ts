import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockExec, mockQuery } = vi.hoisted(() => ({
  mockExec: vi.fn().mockResolvedValue(0),
  mockQuery: vi.fn(),
}))

vi.mock('@/src/infrastructure/db/client', () => ({
  prisma: {
    $executeRawUnsafe: mockExec,
    $queryRawUnsafe: mockQuery,
  },
}))

import {
  enqueueSimJob,
  getSimJob,
  claimSimJob,
  markSimJobComplete,
  markSimJobFailed,
  dequeueSimJobs,
} from '../simJobs'

const NOW = '2026-04-19T10:00:00.000Z'

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'job-1',
    simulationId: 'sim-1',
    status: 'queued',
    retryCount: 0,
    maxRetries: 3,
    result: null,
    errorMsg: null,
    nextRetryAt: null,
    createdAt: NOW,
    startedAt: null,
    completedAt: null,
    ...overrides,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('enqueueSimJob', () => {
  it('inserts a queued row and returns it', async () => {
    mockExec.mockResolvedValue(1)
    mockQuery.mockResolvedValueOnce([makeRow()])  // ensureTable x3, then SELECT

    const job = await enqueueSimJob('sim-1')
    expect(job.simulationId).toBe('sim-1')
    expect(job.status).toBe('queued')
    expect(job.retryCount).toBe(0)
  })
})

describe('getSimJob', () => {
  it('returns null for unknown jobId', async () => {
    mockQuery.mockResolvedValueOnce([])
    expect(await getSimJob('missing')).toBeNull()
  })

  it('returns the job when found', async () => {
    mockQuery.mockResolvedValueOnce([makeRow()])
    const job = await getSimJob('job-1')
    expect(job?.id).toBe('job-1')
  })

  it('parses dates correctly', async () => {
    mockQuery.mockResolvedValueOnce([makeRow({ startedAt: NOW, completedAt: NOW })])
    const job = await getSimJob('job-1')
    expect(job?.startedAt).toBeInstanceOf(Date)
    expect(job?.completedAt).toBeInstanceOf(Date)
  })
})

describe('claimSimJob', () => {
  it('returns true when job is claimed (row updated)', async () => {
    mockExec.mockResolvedValueOnce(1)
    expect(await claimSimJob('job-1')).toBe(true)
  })

  it('returns false when claim fails (already processing)', async () => {
    mockExec.mockResolvedValueOnce(0)
    expect(await claimSimJob('job-1')).toBe(false)
  })
})

describe('markSimJobComplete', () => {
  it('calls executeRawUnsafe with completed status and result', async () => {
    await markSimJobComplete('job-1', '{"runId":"r1"}')
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('completed'),
      '{"runId":"r1"}',
      expect.any(String),
      'job-1',
    )
  })
})

describe('markSimJobFailed', () => {
  it('moves to dead-lettered when maxRetries reached', async () => {
    mockQuery.mockResolvedValueOnce([{ retryCount: 2, maxRetries: 3 }])
    await markSimJobFailed('job-1', 'timeout')
    const call = mockExec.mock.calls.find(c => String(c[0]).includes('dead-lettered'))
    expect(call).toBeDefined()
  })

  it('requeues with exponential backoff when retries remain', async () => {
    mockQuery.mockResolvedValueOnce([{ retryCount: 0, maxRetries: 3 }])
    await markSimJobFailed('job-1', 'timeout')
    const call = mockExec.mock.calls.find(c => String(c[0]).includes("status = 'queued'"))
    expect(call).toBeDefined()
    // nextRetryAt should be ~30s in the future (2^0 * 30)
    const nextRetryArg = call![3] as string
    const nextRetry = new Date(nextRetryArg).getTime()
    expect(nextRetry).toBeGreaterThan(Date.now() + 25_000)
    expect(nextRetry).toBeLessThan(Date.now() + 35_000)
  })

  it('uses exponential delay for second retry (60s)', async () => {
    mockQuery.mockResolvedValueOnce([{ retryCount: 1, maxRetries: 3 }])
    await markSimJobFailed('job-1', 'timeout')
    const call = mockExec.mock.calls.find(c => String(c[0]).includes("status = 'queued'"))
    const nextRetryArg = call![3] as string
    const nextRetry = new Date(nextRetryArg).getTime()
    // 2^1 * 30 = 60s
    expect(nextRetry).toBeGreaterThan(Date.now() + 55_000)
    expect(nextRetry).toBeLessThan(Date.now() + 65_000)
  })
})

describe('dequeueSimJobs', () => {
  it('returns up to limit queued jobs ready to process', async () => {
    mockQuery.mockResolvedValueOnce([makeRow(), makeRow({ id: 'job-2' })])
    const jobs = await dequeueSimJobs(5)
    expect(jobs).toHaveLength(2)
    expect(jobs[0].status).toBe('queued')
  })

  it('returns empty array when queue is empty', async () => {
    mockQuery.mockResolvedValueOnce([])
    const jobs = await dequeueSimJobs(5)
    expect(jobs).toEqual([])
  })
})
