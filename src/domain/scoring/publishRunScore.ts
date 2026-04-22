import { prisma } from '@/src/infrastructure/db/client'
import { scoreEventChannel } from './scoreEventChannel'
import type { RunScoreEvent } from './scoreEventTypes'

export async function publishRunScore(runId: string): Promise<RunScoreEvent | null> {
  const score = await prisma.runScore.findUnique({
    where: { runId },
    include: { run: { select: { sprintId: true } } },
  })

  if (!score) {
    return null
  }

  const event: RunScoreEvent = {
    runId: score.runId,
    sprintId: score.run?.sprintId ?? null,
    itemsCreated: score.itemsCreated,
    itemsReworked: score.itemsReworked,
    sprintShipped: Boolean(score.sprintShipped),
    efficiencyScore: score.efficiencyScore,
    timestamp: score.createdAt.toISOString(),
  }

  scoreEventChannel.publish(event)
  return event
}
