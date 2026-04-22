import { NextRequest, NextResponse } from 'next/server'
import { runFeedbackDigest } from '@/src/domain/agents/feedbackDigestAgent'

/**
 * POST /api/projects/:id/feedback-digest
 * Body (optional): { days?: number }
 * Generates a feedback digest for all agents in the project
 * based on RunScore data and writes summaries to AgentMemory.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params
  let days = 30
  try {
    const body = await req.json() as { days?: number }
    if (typeof body.days === 'number') days = body.days
  } catch {
    // no body or not JSON — use defaults
  }

  const result = await runFeedbackDigest(projectId, { days })
  return NextResponse.json({ ok: true, ...result })
}
