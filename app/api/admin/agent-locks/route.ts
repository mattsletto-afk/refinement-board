/**
 * Admin API: List all agent locks, optionally filtered by runId or simulationId.
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/src/infrastructure/db/client'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const runId = searchParams.get('runId') ?? undefined
  const simulationId = searchParams.get('simulationId') ?? undefined

  try {
    const locks = await prisma.agentLock.findMany({
      where: {
        ...(runId ? { runId } : {}),
        ...(simulationId ? { simulationId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ locks })
  } catch (err) {
    console.error('[AgentLocks LIST]', err)
    return NextResponse.json({ error: 'Failed to list locks' }, { status: 500 })
  }
}
