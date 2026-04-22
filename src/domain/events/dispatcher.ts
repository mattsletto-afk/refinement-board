/**
 * Event dispatcher service.
 * Accepts events, applies deduplication, and enqueues them for processing.
 */

import {
  enqueueEvent,
  dequeueEvents,
  markProcessing,
  markCompleted,
  markFailed,
} from '@/src/infrastructure/db/triggerEvents'
import type { CreateEventInput, SimulationEvent } from '@/src/domain/events/schema'

export interface DispatchResult {
  event: SimulationEvent | null
  deduplicated: boolean
}

/**
 * Dispatch a simulation trigger event.
 * Returns null event + deduplicated=true if the event was suppressed.
 */
export async function dispatchEvent(
  input: CreateEventInput
): Promise<DispatchResult> {
  const event = await enqueueEvent(input)
  if (event === null) {
    return { event: null, deduplicated: true }
  }
  return { event, deduplicated: false }
}

/**
 * Process queued events by invoking the simulation run for each.
 * Returns a summary of processed event IDs.
 */
export async function processQueuedEvents(
  runSimulation: (event: SimulationEvent) => Promise<string | undefined>
): Promise<{ processed: string[]; failed: string[]; skipped: string[] }> {
  const events = await dequeueEvents(10)
  const processed: string[] = []
  const failed: string[] = []
  const skipped: string[] = []

  for (const event of events) {
    const acquired = await markProcessing(event.id)
    if (!acquired) {
      skipped.push(event.id)
      continue
    }

    try {
      const simulationId = await runSimulation(event)
      await markCompleted(event.id, simulationId)
      processed.push(event.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await markFailed(event.id, message)
      failed.push(event.id)
    }
  }

  return { processed, failed, skipped }
}
