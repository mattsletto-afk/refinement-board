import type { RunScoreEvent } from './scoreEventTypes'

export function makeRunScoreEvent(overrides: Partial<RunScoreEvent> = {}): RunScoreEvent {
  return {
    runId: 'run-test-001',
    sprintId: 'sprint-test-001',
    itemsCreated: 5,
    itemsReworked: 1,
    sprintShipped: true,
    efficiencyScore: 0.8,
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}
