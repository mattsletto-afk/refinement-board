import { NextResponse } from 'next/server'
import { executeStory } from '@/src/domain/executeStory'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; storyId: string }> }
) {
  const { id: projectId, storyId } = await params

  const result = await executeStory(projectId, storyId)

  if (result.error) {
    const status =
      result.error.includes('not found') ? 404 :
      result.error.includes('does not belong') ? 403 :
      500
    return NextResponse.json({ error: result.error }, { status })
  }

  return NextResponse.json(result)
}
