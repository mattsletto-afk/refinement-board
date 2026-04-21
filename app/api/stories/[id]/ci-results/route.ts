import { NextRequest, NextResponse } from 'next/server'
import { getPipelineResultsForStory } from '@/src/domain/ci-pipeline/ciPipelineService'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params
  const results = await getPipelineResultsForStory(id)
  return NextResponse.json({ results })
}
