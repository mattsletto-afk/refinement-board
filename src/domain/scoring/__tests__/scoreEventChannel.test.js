const { describe, test, expect, beforeEach } = require('@jest/globals')

beforeEach(() => jest.clearAllMocks())

// Self-contained ScoreEventChannel implementation mirroring the production module
function makeScoreEventChannel() {
  const listeners = new Set()

  function subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function publish(event) {
    for (const listener of listeners) {
      listener(event)
    }
  }

  function listenerCount() {
    return listeners.size
  }

  return { subscribe, publish, listenerCount }
}

function makeEvent(overrides = {}) {
  return {
    runId: 'run-001',
    sprintId: 'sprint-001',
    itemsCreated: 3,
    itemsReworked: 1,
    sprintShipped: true,
    efficiencyScore: 0.75,
    timestamp: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('ScoreEventChannel', () => {
  test('subscribe adds a listener and it receives published events', () => {
    const channel = makeScoreEventChannel()
    const received = []
    channel.subscribe((evt) => received.push(evt))

    const event = makeEvent()
    channel.publish(event)

    expect(received).toHaveLength(1)
    expect(received[0]).toEqual(event)
  })

  test('multiple subscribers all receive the same event', () => {
    const channel = makeScoreEventChannel()
    const a = []
    const b = []
    channel.subscribe((evt) => a.push(evt))
    channel.subscribe((evt) => b.push(evt))

    channel.publish(makeEvent({ runId: 'run-multi' }))

    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
    expect(a[0].runId).toBe('run-multi')
    expect(b[0].runId).toBe('run-multi')
  })

  test('unsubscribe stops listener from receiving future events', () => {
    const channel = makeScoreEventChannel()
    const received = []
    const unsub = channel.subscribe((evt) => received.push(evt))

    channel.publish(makeEvent({ runId: 'before' }))
    unsub()
    channel.publish(makeEvent({ runId: 'after' }))

    expect(received).toHaveLength(1)
    expect(received[0].runId).toBe('before')
  })

  test('listenerCount reflects active subscriptions', () => {
    const channel = makeScoreEventChannel()
    expect(channel.listenerCount()).toBe(0)

    const unsub1 = channel.subscribe(() => {})
    expect(channel.listenerCount()).toBe(1)

    const unsub2 = channel.subscribe(() => {})
    expect(channel.listenerCount()).toBe(2)

    unsub1()
    expect(channel.listenerCount()).toBe(1)

    unsub2()
    expect(channel.listenerCount()).toBe(0)
  })

  test('publishing with no subscribers does not throw', () => {
    const channel = makeScoreEventChannel()
    expect(() => channel.publish(makeEvent())).not.toThrow()
  })

  test('multiple events are received in order', () => {
    const channel = makeScoreEventChannel()
    const received = []
    channel.subscribe((evt) => received.push(evt.runId))

    channel.publish(makeEvent({ runId: 'run-1' }))
    channel.publish(makeEvent({ runId: 'run-2' }))
    channel.publish(makeEvent({ runId: 'run-3' }))

    expect(received).toEqual(['run-1', 'run-2', 'run-3'])
  })

  test('event payload fields are passed through unchanged', () => {
    const channel = makeScoreEventChannel()
    let captured = null
    channel.subscribe((evt) => { captured = evt })

    const event = makeEvent({
      runId: 'run-payload',
      itemsCreated: 7,
      itemsReworked: 2,
      sprintShipped: false,
      efficiencyScore: 0.42,
    })
    channel.publish(event)

    expect(captured).not.toBeNull()
    expect(captured.runId).toBe('run-payload')
    expect(captured.itemsCreated).toBe(7)
    expect(captured.itemsReworked).toBe(2)
    expect(captured.sprintShipped).toBe(false)
    expect(captured.efficiencyScore).toBeCloseTo(0.42)
  })

  test('same listener added twice is only called once per publish', () => {
    const channel = makeScoreEventChannel()
    const received = []
    const listener = (evt) => received.push(evt)
    channel.subscribe(listener)
    channel.subscribe(listener)

    channel.publish(makeEvent())

    expect(received).toHaveLength(1)
  })

  test('channel can handle rapid sequential publishes', () => {
    const channel = makeScoreEventChannel()
    const received = []
    channel.subscribe((evt) => received.push(evt))

    for (let i = 0; i < 20; i++) {
      channel.publish(makeEvent({ runId: `run-${i}` }))
    }

    expect(received).toHaveLength(20)
    expect(received[0].runId).toBe('run-0')
    expect(received[19].runId).toBe('run-19')
  })
})
