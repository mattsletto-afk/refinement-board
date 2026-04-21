import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SimulationEvent } from '@/src/domain/events/schema'
import { buildIdempotencyKey } from '@/src/domain/events/schema'

// ---------------------------------------------------------------------------
// Mock the DB layer so tests don't need a real database
// ---------------------------------------------------------------------------

const { mockEnqueue, mockDequeue, mockMarkProcessing, mockMarkCompleted, mockMarkFailed } = vi.hoisted(() => ({
  mockEnqueue: vi.fn(),
  mockDequeue: vi.fn(),
  mockMarkProcessing: vi.fn(),
  mockMarkCompleted: vi.fn(),
  mockMarkFailed: vi.fn(),
}))

vi.mock('@/src/infrastructure/db/triggerEvents', () => ({
  enqueueEvent: mockEnqueue,
  dequeueEvents: mockDequeue,
  markProcessing: mockMarkProcessing,
  markCompleted: mockMarkCompleted,
  markFailed: mockMarkFailed,
  ensureTriggerEventTable: vi.fn().mockResolvedValue(undefined),
  getEventById: vi.fn(),
  getDeadLetterEvents: vi.fn(),
  listEvents: vi.fn(),
}))

import { dispatchEvent, processQueuedEvents } from '@/src/domain/events/dispatcher'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<SimulationEvent> = {}): SimulationEvent {
  return {
    id: 'evt-1',
    type: 'sprint-boundary',
    payload: {
      sprintId: 'sprint-1',
      sprintName: 'Sprint 1',
      boundaryType: 'end',
      projectId: 'proj-1',
      workstreamIds: ['ws-1'],
    },
    idempotencyKey: 'sprint-boundary:sprint-1:end',
    status: 'queued',
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Schema tests
// ---------------------------------------------------------------------------

describe('buildIdempotencyKey', () => {
  it('builds a sprint-boundary key', () => {
    const key = buildIdempotencyKey('sprint-boundary', {
      sprintId: 'sp-42',
      sprintName: 'Sprint 42',
      boundaryType: 'end',
      projectId: 'proj-1',
      workstreamIds: [],
    })
    expect(key).toBe('sprint-boundary:sp-42:end')
  })

  it('builds a blocker-resolved key', () => {
    const key = buildIdempotencyKey('blocker-resolved', {
      taskId: 'task-99',
      workstreamId: 'ws-1',
      projectId: 'proj-1',
      previousStatus: 'blocked',
    })
    expect(key).toBe('blocker-resolved:task-99')
  })

  it('builds a scope-added key using storyId', () => {
    const key = buildIdempotencyKey('scope-added', {
      storyId: 'story-5',
      projectId: 'proj-1',
    })
    expect(key).toBe('scope-added:proj-1:story-5')
  })

  it('builds a scope-added key using featureId when storyId absent', () => {
    const key = buildIdempotencyKey('scope-added', {
      featureId: 'feat-3',
      projectId: 'proj-1',
    })
    expect(key).toBe('scope-added:proj-1:feat-3')
  })
})

// ---------------------------------------------------------------------------
// Dispatcher — dispatch tests
// ---------------------------------------------------------------------------

describe('dispatchEvent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the event when successfully enqueued', async () => {
    const evt = makeEvent()
    mockEnqueue.mockResolvedValue(evt)

    const result = await dispatchEvent({
      type: 'sprint-boundary',
      payload: evt.payload,
    })

    expect(result.deduplicated).toBe(false)
    expect(result.event).toEqual(evt)
    expect(mockEnqueue).toHaveBeenCalledOnce()
  })

  it('returns deduplicated=true when enqueueEvent returns null', async () => {
    mockEnqueue.mockResolvedValue(null)

    const result = await dispatchEvent({
      type: 'blocker-resolved',
      payload: {
        taskId: 'task-1',
        workstreamId: 'ws-1',
        projectId: 'proj-1',
        previousStatus: 'blocked',
      },
    })

    expect(result.deduplicated).toBe(true)
    expect(result.event).toBeNull()
  })

  it('passes custom idempotency key to enqueueEvent', async () => {
    mockEnqueue.mockResolvedValue(makeEvent())

    await dispatchEvent({
      type: 'scope-added',
      payload: { projectId: 'proj-1', storyId: 'story-1' },
      idempotencyKey: 'custom-key-123',
    })

    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'custom-key-123' })
    )
  })
})

// ---------------------------------------------------------------------------
// Dispatcher — processQueuedEvents tests
// ---------------------------------------------------------------------------

describe('processQueuedEvents', () => {
  beforeEach(() => vi.clearAllMocks())

  it('processes a queued event successfully', async () => {
    const evt = makeEvent()
    mockDequeue.mockResolvedValue([evt])
    mockMarkProcessing.mockResolvedValue(true)
    const runFn = vi.fn().mockResolvedValue('sim-123')

    const result = await processQueuedEvents(runFn)

    expect(result.processed).toEqual([evt.id])
    expect(result.failed).toEqual([])
    expect(result.skipped).toEqual([])
    expect(mockMarkCompleted).toHaveBeenCalledWith(evt.id, 'sim-123')
  })

  it('skips events that cannot be acquired (optimistic lock)', async () => {
    const evt = makeEvent()
    mockDequeue.mockResolvedValue([evt])
    mockMarkProcessing.mockResolvedValue(false)
    const runFn = vi.fn()

    const result = await processQueuedEvents(runFn)

    expect(result.skipped).toEqual([evt.id])
    expect(runFn).not.toHaveBeenCalled()
  })

  it('marks event as failed when runSimulation throws', async () => {
    const evt = makeEvent()
    mockDequeue.mockResolvedValue([evt])
    mockMarkProcessing.mockResolvedValue(true)
    const runFn = vi.fn().mockRejectedValue(new Error('AI timeout'))

    const result = await processQueuedEvents(runFn)

    expect(result.failed).toEqual([evt.id])
    expect(mockMarkFailed).toHaveBeenCalledWith(evt.id, 'AI timeout')
  })

  it('handles an empty queue gracefully', async () => {
    mockDequeue.mockResolvedValue([])
    const runFn = vi.fn()

    const result = await processQueuedEvents(runFn)

    expect(result.processed).toEqual([])
    expect(result.failed).toEqual([])
    expect(result.skipped).toEqual([])
    expect(runFn).not.toHaveBeenCalled()
  })

  it('processes multiple events and handles mixed success/failure', async () => {
    const evt1 = makeEvent({ id: 'evt-1' })
    const evt2 = makeEvent({ id: 'evt-2' })
    const evt3 = makeEvent({ id: 'evt-3' })

    mockDequeue.mockResolvedValue([evt1, evt2, evt3])
    mockMarkProcessing
      .mockResolvedValueOnce(true)  // evt1 acquired
      .mockResolvedValueOnce(false) // evt2 lock miss
      .mockResolvedValueOnce(true)  // evt3 acquired

    const runFn = vi
      .fn()
      .mockResolvedValueOnce('sim-1')          // evt1 ok
      .mockRejectedValueOnce(new Error('oops')) // evt3 fails

    const result = await processQueuedEvents(runFn)

    expect(result.processed).toEqual(['evt-1'])
    expect(result.skipped).toEqual(['evt-2'])
    expect(result.failed).toEqual(['evt-3'])
  })
})

// ---------------------------------------------------------------------------
// Sprint boundary trigger integration
// ---------------------------------------------------------------------------

describe('sprint-boundary trigger type', () => {
  it('includes correct payload shape', () => {
    const payload = {
      sprintId: 'sp-1',
      sprintName: 'Sprint Alpha',
      boundaryType: 'end' as const,
      projectId: 'proj-1',
      workstreamIds: ['ws-a', 'ws-b'],
    }
    const key = buildIdempotencyKey('sprint-boundary', payload)
    expect(key).toBe('sprint-boundary:sp-1:end')
    // Same sprint start produces different key
    const startKey = buildIdempotencyKey('sprint-boundary', { ...payload, boundaryType: 'start' })
    expect(startKey).toBe('sprint-boundary:sp-1:start')
    expect(startKey).not.toBe(key)
  })
})

// ---------------------------------------------------------------------------
// Blocker-resolved trigger integration
// ---------------------------------------------------------------------------

describe('blocker-resolved trigger type', () => {
  beforeEach(() => vi.clearAllMocks())

  it('dispatches with workstream-scoped idempotency key', async () => {
    const evt = makeEvent({
      id: 'evt-blocker-1',
      type: 'blocker-resolved',
      payload: {
        taskId: 'task-42',
        workstreamId: 'ws-alpha',
        projectId: 'proj-1',
        previousStatus: 'blocked',
      },
      idempotencyKey: 'blocker-resolved:task-42',
    })
    mockEnqueue.mockResolvedValue(evt)

    const result = await dispatchEvent({
      type: 'blocker-resolved',
      payload: {
        taskId: 'task-42',
        workstreamId: 'ws-alpha',
        projectId: 'proj-1',
        previousStatus: 'blocked',
      },
    })

    expect(result.deduplicated).toBe(false)
    expect(result.event?.type).toBe('blocker-resolved')
  })

  it('deduplicates blocker-resolved for same task within window', async () => {
    mockEnqueue.mockResolvedValue(null) // dedup

    const result = await dispatchEvent({
      type: 'blocker-resolved',
      payload: {
        taskId: 'task-42',
        workstreamId: 'ws-alpha',
        projectId: 'proj-1',
        previousStatus: 'blocked',
      },
    })

    expect(result.deduplicated).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Scope-added trigger integration
// ---------------------------------------------------------------------------

describe('scope-added trigger type', () => {
  beforeEach(() => vi.clearAllMocks())

  it('dispatches scope-added event', async () => {
    const evt = makeEvent({
      id: 'evt-scope-1',
      type: 'scope-added',
      payload: { projectId: 'proj-1', storyId: 'story-99', workstreamId: 'ws-1' },
      idempotencyKey: 'scope-added:proj-1:story-99',
    })
    mockEnqueue.mockResolvedValue(evt)

    const result = await dispatchEvent({
      type: 'scope-added',
      payload: { projectId: 'proj-1', storyId: 'story-99' },
    })

    expect(result.deduplicated).toBe(false)
    expect(result.event?.type).toBe('scope-added')
  })

  it('deduplicates scope-added for same scope ref', async () => {
    mockEnqueue.mockResolvedValue(null)

    const result = await dispatchEvent({
      type: 'scope-added',
      payload: { projectId: 'proj-1', storyId: 'story-99' },
    })

    expect(result.deduplicated).toBe(true)
  })
})
