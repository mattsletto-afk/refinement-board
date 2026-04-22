/**
 * Sprint boundary detector.
 * Scans active sprints and fires sprint-boundary events when boundaries are crossed.
 */

import { prisma } from '@/src/infrastructure/db/client'
import { dispatchEvent } from '@/src/domain/events/dispatcher'
import type { SprintBoundaryPayload } from '@/src/domain/events/schema'

interface SprintRecord {
  id: string
  name: string
  startDate: Date | null
  endDate: Date | null
  projectId: string
  workstreamId: string | null
}

/**
 * Detect sprint boundaries and emit events.
 * Should be called by the polling processor every ~30s.
 *
 * A boundary is detected when:
 *  - endDate has passed (sprint end boundary)
 *  - startDate is now in the past and sprint was not yet started (sprint start boundary)
 *
 * Returns the number of events dispatched.
 */
export async function detectAndEmitSprintBoundaries(): Promise<number> {
  const now = new Date()
  let dispatched = 0

  // Query sprints that have start/end dates crossing now.
  // We look at sprints whose endDate is between (now - 60s) and now,
  // or whose startDate is between (now - 60s) and now.
  const windowStart = new Date(now.getTime() - 60 * 1000)

  let sprints: SprintRecord[] = []

  try {
    // Try to use Sprint model if it exists
    sprints = await (prisma as any).sprint.findMany({
      where: {
        OR: [
          {
            endDate: {
              gte: windowStart,
              lte: now,
            },
          },
          {
            startDate: {
              gte: windowStart,
              lte: now,
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        projectId: true,
        workstreamId: true,
      },
    })
  } catch {
    // Sprint model may not exist in all schema versions; degrade gracefully
    return 0
  }

  for (const sprint of sprints) {
    const isEndBoundary =
      sprint.endDate !== null &&
      sprint.endDate >= windowStart &&
      sprint.endDate <= now

    const isStartBoundary =
      sprint.startDate !== null &&
      sprint.startDate >= windowStart &&
      sprint.startDate <= now

    if (!isStartBoundary && !isEndBoundary) continue

    const boundaryType = isEndBoundary ? 'end' : 'start'

    const payload: SprintBoundaryPayload = {
      sprintId: sprint.id,
      sprintName: sprint.name,
      boundaryType,
      projectId: sprint.projectId,
      workstreamIds: sprint.workstreamId ? [sprint.workstreamId] : [],
    }

    const result = await dispatchEvent({
      type: 'sprint-boundary',
      payload,
    })

    if (!result.deduplicated) {
      dispatched++
    }
  }

  return dispatched
}
