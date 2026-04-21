import { NextRequest, NextResponse } from 'next/server'
import { pruneAllAgentsForProject } from '@/src/domain/agentMemory/evictionPolicy'

/**
 * POST /api/admin/agent-memory/prune
 * Body: { projectId: string }
 * Runs the memory eviction policy for all agents in a project.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json() as { projectId?: string }
  if (!body.projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }

  const results = await pruneAllAgentsForProject(body.projectId)
  const totalDeleted = results.reduce((s, r) => s + r.deletedTtl + r.deletedCap, 0)

  return NextResponse.json({ ok: true, results, totalDeleted })
}
