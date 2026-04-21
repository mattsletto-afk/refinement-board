import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before importing auditLog
vi.mock('@/src/infrastructure/db/client', () => ({
  prisma: {
    auditLog: {
      findFirst: vi.fn(),
      create:    vi.fn(),
      findMany:  vi.fn(),
    },
  },
}))

import { appendAuditEvent, verifyAuditChain } from '../auditLog'
import { prisma } from '@/src/infrastructure/db/client'

const mockPrisma = prisma as unknown as {
  auditLog: {
    findFirst: ReturnType<typeof vi.fn>
    create:    ReturnType<typeof vi.fn>
    findMany:  ReturnType<typeof vi.fn>
  }
}

beforeEach(() => { vi.clearAllMocks() })

describe('appendAuditEvent', () => {
  it('creates first entry with seqNum=1 and empty prevHash', async () => {
    mockPrisma.auditLog.findFirst.mockResolvedValue(null)
    mockPrisma.auditLog.create.mockResolvedValue({ id: 'entry-1' })

    const id = await appendAuditEvent({
      projectId: 'proj-1',
      eventType: 'run.triggered',
      details: { foo: 'bar' },
    })

    expect(id).toBe('entry-1')
    const created = mockPrisma.auditLog.create.mock.calls[0][0].data
    expect(created.seqNum).toBe(1)
    expect(created.prevHash).toBe('')
    expect(created.entryHash).toMatch(/^[a-f0-9]{64}$/)
    expect(created.eventType).toBe('run.triggered')
  })

  it('chains from previous entry seqNum and hash', async () => {
    const prevEntry = { seqNum: 5, entryHash: 'abc123' }
    mockPrisma.auditLog.findFirst.mockResolvedValue(prevEntry)
    mockPrisma.auditLog.create.mockResolvedValue({ id: 'entry-6' })

    await appendAuditEvent({ projectId: 'proj-1', eventType: 'change.applied' })

    const created = mockPrisma.auditLog.create.mock.calls[0][0].data
    expect(created.seqNum).toBe(6)
    expect(created.prevHash).toBe('abc123')
  })
})

describe('verifyAuditChain', () => {
  it('returns valid=true for empty log', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([])
    const result = await verifyAuditChain('proj-1')
    expect(result.valid).toBe(true)
    expect(result.checkedCount).toBe(0)
  })

  it('detects a tampered entry', async () => {
    // Build real entries then corrupt one
    mockPrisma.auditLog.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ seqNum: 1, entryHash: 'realHash1' })

    mockPrisma.auditLog.create
      .mockResolvedValueOnce({ id: 'e1' })
      .mockResolvedValueOnce({ id: 'e2' })

    await appendAuditEvent({ projectId: 'p', eventType: 'run.triggered' })
    await appendAuditEvent({ projectId: 'p', eventType: 'run.completed' })

    const e1Call = mockPrisma.auditLog.create.mock.calls[0][0].data
    const e2Call = mockPrisma.auditLog.create.mock.calls[1][0].data

    // Tamper e1's entryHash
    const tamperedEntries = [
      { seqNum: e1Call.seqNum, eventType: e1Call.eventType, details: e1Call.details, prevHash: e1Call.prevHash, entryHash: 'tampered' },
      { seqNum: e2Call.seqNum, eventType: e2Call.eventType, details: e2Call.details, prevHash: e2Call.prevHash, entryHash: e2Call.entryHash },
    ]
    mockPrisma.auditLog.findMany.mockResolvedValue(tamperedEntries)

    const result = await verifyAuditChain('p')
    expect(result.valid).toBe(false)
    expect(result.firstBadSeq).toBe(1)
  })
})
