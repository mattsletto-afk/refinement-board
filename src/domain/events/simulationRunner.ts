/**
 * Bridge between the trigger engine and the simulation run endpoint.
 * Converts a SimulationEvent into an internal simulation run.
 */

import { prisma } from '@/src/infrastructure/db/client'
import type { SimulationEvent, BlockerResolvedPayload, SprintBoundaryPayload, ScopeAddedPayload } from '@/src/domain/events/schema'

/**
 * Given a trigger event, determine the simulation ID to run against
 * and invoke the run logic.
 *
 * In this implementation we call the internal API route directly
 * via fetch so we reuse the existing run pipeline.
 *
 * Returns the simulationId that was run.
 */
export async function runSimulationForEvent(
  event: SimulationEvent,
  baseUrl: string
): Promise<string | undefined> {
  const simulationId = await resolveSimulationId(event)
  if (!simulationId) {
    throw new Error(`No simulation found for event ${event.id} (type=${event.type})`)
  }

  const response = await fetch(
    `${baseUrl}/api/simulations/${simulationId}/run`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        triggeredBy: event.type,
        eventId: event.id,
        payload: event.payload,
      }),
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Simulation run failed (${response.status}): ${text}`)
  }

  return simulationId
}

/**
 * Resolve which simulation ID to use for the given event.
 * Strategy:
 *  - sprint-boundary: find the most recent simulation for the project
 *  - blocker-resolved: find the simulation tied to the workstream
 *  - scope-added: find simulation for the project
 */
async function resolveSimulationId(
  event: SimulationEvent
): Promise<string | undefined> {
  switch (event.type) {
    case 'sprint-boundary': {
      const p = event.payload as SprintBoundaryPayload
      const sim = await prisma.simulationSession.findFirst({
        where: { projectId: p.projectId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
      return sim?.id
    }

    case 'blocker-resolved': {
      const p = event.payload as BlockerResolvedPayload
      // Find simulation scoped to the workstream's project
      const workstream = await (prisma as any).workstream.findFirst({
        where: { id: p.workstreamId },
        select: { projectId: true },
      }).catch(() => null)

      const projectId = workstream?.projectId ?? p.projectId
      const sim = await prisma.simulationSession.findFirst({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
      return sim?.id
    }

    case 'scope-added': {
      const p = event.payload as ScopeAddedPayload
      const sim = await prisma.simulationSession.findFirst({
        where: { projectId: p.projectId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
      return sim?.id
    }

    default:
      return undefined
  }
}
