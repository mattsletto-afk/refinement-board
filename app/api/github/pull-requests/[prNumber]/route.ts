import { NextRequest, NextResponse } from 'next/server'
import { getOctokit, getGitHubRepo } from '@/src/infrastructure/github/client'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ prNumber: string }> },
): Promise<NextResponse> {
  const { prNumber } = await params
  const parsed = parseInt(prNumber, 10)

  if (isNaN(parsed) || parsed <= 0) {
    return NextResponse.json({ error: 'Invalid PR number' }, { status: 400 })
  }

  try {
    const octokit = getOctokit()
    const { owner, repo } = getGitHubRepo()

    const { data: pr } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: parsed,
    })

    return NextResponse.json({
      prNumber: pr.number,
      prUrl: pr.html_url,
      state: pr.state,
      merged: pr.merged,
      branchName: pr.head.ref,
      headSha: pr.head.sha,
      title: pr.title,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
    })
  } catch (error: unknown) {
    const isNotFound =
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      (error as { status: number }).status === 404

    if (isNotFound) {
      return NextResponse.json({ error: 'Pull request not found' }, { status: 404 })
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
