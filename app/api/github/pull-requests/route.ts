import { NextRequest, NextResponse } from 'next/server'
import { createPullRequestFromDiff } from '@/src/infrastructure/github/git-service'
import type { GitHubFileChange } from '@/src/domain/github/types'

interface CreatePrRequestBody {
  storyId: string
  storyTitle: string
  agentAction: string
  diffSummary: string
  filesChanged?: string[]
  files?: GitHubFileChange[]
  baseRef?: string
}

function isValidBody(body: unknown): body is CreatePrRequestBody {
  if (typeof body !== 'object' || body === null) return false
  const b = body as Record<string, unknown>
  return (
    typeof b.storyId === 'string' && b.storyId.length > 0 &&
    typeof b.storyTitle === 'string' && b.storyTitle.length > 0 &&
    typeof b.agentAction === 'string' && b.agentAction.length > 0 &&
    typeof b.diffSummary === 'string' && b.diffSummary.length > 0
  )
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!isValidBody(body)) {
    return NextResponse.json(
      { error: 'Missing required fields: storyId, storyTitle, agentAction, diffSummary' },
      { status: 400 },
    )
  }

  const files: GitHubFileChange[] = body.files ?? []

  try {
    const result = await createPullRequestFromDiff({
      storyId: body.storyId,
      storyTitle: body.storyTitle,
      agentAction: body.agentAction,
      diffSummary: body.diffSummary,
      filesChanged: body.filesChanged ?? files.map(f => f.path),
      files,
      baseRef: body.baseRef,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const isConfig = message.includes('environment variable')
    return NextResponse.json(
      { error: message },
      { status: isConfig ? 503 : 500 },
    )
  }
}
