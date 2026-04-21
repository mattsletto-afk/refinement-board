import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/infrastructure/db/client'
import { isPkeyFormat } from '@/src/domain/jira-import/pkey-lookup'

export async function POST(request: NextRequest) {
  const body = await request.json()

  if (!Array.isArray(body.pkeys)) {
    return NextResponse.json(
      { error: 'pkeys must be an array of strings' },
      { status: 400 }
    )
  }

  const pkeys: string[] = body.pkeys.filter(
    (k: unknown): k is string => typeof k === 'string' && isPkeyFormat(k)
  )

  if (pkeys.length === 0) {
    return NextResponse.json({ conflicts: [] })
  }

  const conflicts: Array<{
    pkey: string
    entityType: 'story' | 'epic'
    id: string
    title: string
  }> = []

  for (const pkey of pkeys) {
    const pkeyPrefix = pkey + ' '

    const epic = await prisma.epic.findFirst({
      where: {
        OR: [{ title: pkey }, { title: { startsWith: pkeyPrefix } }],
      },
    })

    if (epic) {
      conflicts.push({ pkey, entityType: 'epic', id: epic.id, title: epic.title })
      continue
    }

    const story = await prisma.story.findFirst({
      where: {
        OR: [{ title: pkey }, { title: { startsWith: pkeyPrefix } }],
      },
    })

    if (story) {
      conflicts.push({ pkey, entityType: 'story', id: story.id, title: story.title })
    }
  }

  return NextResponse.json({ conflicts })
}
