import { NextResponse } from 'next/server'
import { prisma } from '@/src/infrastructure/db/client'

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 10

  const scores = await prisma.runScore.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      run: {
        select: {
          sprintId: true,
          createdAt: true,
        },
      },
    },
  })

  const payload = scores.map((score) => ({
    runId: score.runId,
    sprintId: score.run?.sprintId ?? null,
    itemsCreated: score.itemsCreated,
    itemsReworked: score.itemsReworked,
    sprintShipped: score.sprintShipped,
    efficiencyScore: score.efficiencyScore,
    timestamp: score.createdAt.toISOString(),
  }))

  return NextResponse.json({ scores: payload })
}
