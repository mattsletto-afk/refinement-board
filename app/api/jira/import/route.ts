import { NextRequest, NextResponse } from 'next/server'
import { importWithConflictResolution } from '@/src/domain/jira-import/import-with-conflict-resolution'
import type { ConflictStrategy } from '@/src/domain/jira-import/conflict-resolution'
import { isPkeyFormat } from '@/src/domain/jira-import/pkey-lookup'

const VALID_STRATEGIES: ConflictStrategy[] = ['skip', 'overwrite', 'merge']

function isValidStrategy(value: unknown): value is ConflictStrategy {
  return typeof value === 'string' && (VALID_STRATEGIES as string[]).includes(value)
}

function isValidStatus(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export async function POST(request: NextRequest) {
  const body = await request.json()

  const strategy: ConflictStrategy = isValidStrategy(body.strategy)
    ? body.strategy
    : 'skip'

  if (!Array.isArray(body.epics) || !Array.isArray(body.stories)) {
    return NextResponse.json(
      { error: 'Request body must include epics and stories arrays' },
      { status: 400 }
    )
  }

  const epics = body.epics.filter(
    (e: unknown): e is {
      pkey: string
      title: string
      status: string
      priority: string
      description: string | null
      labels: string[]
    } =>
      typeof e === 'object' &&
      e !== null &&
      typeof (e as Record<string, unknown>).pkey === 'string' &&
      isPkeyFormat((e as Record<string, unknown>).pkey as string) &&
      typeof (e as Record<string, unknown>).title === 'string' &&
      isValidStatus((e as Record<string, unknown>).status)
  )

  const stories = body.stories.filter(
    (s: unknown): s is {
      pkey: string
      title: string
      status: string
      priority: string
      epicId: string | null
      featureId: string | null
      storyPoints: number | null
      description: string | null
      assignee: string | null
      labels: string[]
    } =>
      typeof s === 'object' &&
      s !== null &&
      typeof (s as Record<string, unknown>).pkey === 'string' &&
      isPkeyFormat((s as Record<string, unknown>).pkey as string) &&
      typeof (s as Record<string, unknown>).title === 'string' &&
      isValidStatus((s as Record<string, unknown>).status)
  )

  const projectId = typeof body.projectId === 'string' ? body.projectId : ''
  const summary = await importWithConflictResolution(
    { projectId, epics, stories },
    strategy
  )

  return NextResponse.json({ strategy, summary })
}
