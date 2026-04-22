import { prisma } from '@/src/infrastructure/db/client'
import { randomUUID } from 'crypto'

export interface RunScoreInput {
  runId: string
  agentId: string
  itemsCreated: number
  itemsReworked: number
  itemsRejected: number
  sprintShipped: number
  tokensUsed: number
}

export interface RunScoreRecord {
  id: string
  runId: string
  agentId: string
  itemsCreated: number
  itemsReworked: number
  itemsRejected: number
  sprintShipped: number
  tokensUsed: number
  efficiencyScore: number
  createdAt: Date
}

export function calculateEfficiencyScore(
  itemsCreated: number,
  itemsReworked: number,
  itemsRejected: number,
): number {
  const total = itemsCreated + itemsRejected
  if (total === 0) return 0
  const raw = (itemsCreated - itemsReworked) / total
  return Math.round(Math.max(0, Math.min(1, raw)) * 100)
}

export async function saveRunScore(input: RunScoreInput): Promise<RunScoreRecord> {
  const efficiencyScore = calculateEfficiencyScore(
    input.itemsCreated,
    input.itemsReworked,
    input.itemsRejected,
  )

  const record = await prisma.runScore.upsert({
    where: { runId: input.runId },
    create: { id: randomUUID(), ...input, efficiencyScore },
    update: { ...input, efficiencyScore },
  })

  return record
}

export async function getRunScore(runId: string): Promise<RunScoreRecord | null> {
  return prisma.runScore.findUnique({ where: { runId } })
}

export async function getLatestScoreForAgent(agentId: string): Promise<RunScoreRecord | null> {
  const records = await prisma.runScore.findMany({
    where: { agentId },
    orderBy: { createdAt: 'desc' },
    take: 1,
  })
  return records[0] ?? null
}

export async function scoreCompletedRun(runId: string): Promise<RunScoreRecord | null> {
  const run = await prisma.agentRun.findUnique({
    where: { id: runId },
    include: { suggestions: true },
  })

  if (!run || run.status !== 'complete') return null

  const suggestions = run.suggestions ?? []
  const itemsCreated = suggestions.filter(s => s.type === 'create' && s.status === 'applied').length
  const itemsReworked = suggestions.filter(s => s.type === 'update' && s.status === 'applied').length
  const itemsRejected = suggestions.filter(s => s.status === 'rejected').length
  const sprintShipped = suggestions.filter(s => s.status === 'applied').length

  return saveRunScore({
    runId,
    agentId: run.personaId ?? run.agentType,
    itemsCreated,
    itemsReworked,
    itemsRejected,
    sprintShipped,
    tokensUsed: run.tokensUsed,
  })
}
