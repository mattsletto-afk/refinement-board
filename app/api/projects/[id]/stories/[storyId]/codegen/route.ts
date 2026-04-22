import { NextResponse } from 'next/server'
import { runCodeGen } from '@/src/domain/codeGen/codeGenRunner'

/**
 * POST /api/projects/:id/stories/:storyId/codegen
 * Triggers code generation for a specific story.
 * Returns file-write instructions; does not write files directly.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; storyId: string }> },
): Promise<NextResponse> {
  const { id: projectId, storyId } = await params

  try {
    const result = await runCodeGen(projectId, storyId)
    return NextResponse.json({ ok: true, ...result }, { status: result.parseOk ? 200 : 500 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[codegen]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
