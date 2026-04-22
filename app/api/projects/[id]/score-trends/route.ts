import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/infrastructure/db/client'

/**
 * GET /api/projects/:id/score-trends?days=7
 * Returns RunScore records for the project joined with AgentRun,
 * grouped by date and agentType.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params
  const { searchParams } = new URL(req.url)
  const days = parseInt(searchParams.get('days') ?? '7', 10)

  const since = new Date()
  since.setDate(since.getDate() - days)

  const runs = await prisma.agentRun.findMany({
    where: {
      projectId,
      createdAt: { gte: since },
      score:     { isNot: null },
    },
    select: {
      id:        true,
      agentType: true,
      createdAt: true,
      score: {
        select: {
          efficiencyScore: true,
          itemsCreated:    true,
          itemsReworked:   true,
          itemsRejected:   true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  // Group by date (YYYY-MM-DD) and agentType
  type DayKey = string
  type AgentKey = string
  const grouped: Record<DayKey, Record<AgentKey, { scores: number[]; itemsCreated: number; itemsReworked: number; itemsRejected: number }>> = {}

  for (const run of runs) {
    if (!run.score) continue
    const day  = run.createdAt.toISOString().slice(0, 10)
    const type = run.agentType ?? 'unknown'

    if (!grouped[day])             grouped[day] = {}
    if (!grouped[day][type])       grouped[day][type] = { scores: [], itemsCreated: 0, itemsReworked: 0, itemsRejected: 0 }

    grouped[day][type].scores.push(run.score.efficiencyScore)
    grouped[day][type].itemsCreated   += run.score.itemsCreated
    grouped[day][type].itemsReworked  += run.score.itemsReworked
    grouped[day][type].itemsRejected  += run.score.itemsRejected
  }

  // Flatten into rows
  const rows = Object.entries(grouped).flatMap(([date, agents]) =>
    Object.entries(agents).map(([agentType, data]) => ({
      date,
      agentType,
      avgEfficiency: data.scores.length > 0
        ? Math.round((data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 100) / 100
        : 0,
      runCount:      data.scores.length,
      itemsCreated:  data.itemsCreated,
      itemsReworked: data.itemsReworked,
      itemsRejected: data.itemsRejected,
    })),
  )

  return NextResponse.json({ projectId, days, rows })
}
