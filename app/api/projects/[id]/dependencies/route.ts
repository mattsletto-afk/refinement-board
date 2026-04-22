import { NextResponse } from 'next/server'
import { prisma } from '@/src/infrastructure/db/client'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_: Request, { params }: Ctx) {
  const { id: projectId } = await params

  // Get all story IDs in this project
  const stories = await prisma.userStory.findMany({
    where: { projectId },
    select: { id: true },
  })
  const storyIds = stories.map(s => s.id)
  if (storyIds.length === 0) return NextResponse.json([])

  const deps = await prisma.dependency.findMany({
    where: {
      sourceType: 'story',
      targetType: 'story',
      sourceId: { in: storyIds },
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(deps)
}

export async function POST(req: Request, { params }: Ctx) {
  const { id: projectId } = await params
  const { sourceId, targetId } = await req.json() as { sourceId: string; targetId: string }

  // Verify both stories belong to this project
  const count = await prisma.userStory.count({
    where: { id: { in: [sourceId, targetId] }, projectId },
  })
  if (count !== 2) return NextResponse.json({ error: 'stories not found in project' }, { status: 400 })

  // Prevent duplicates
  const existing = await prisma.dependency.findFirst({
    where: { sourceId, targetId, sourceType: 'story', targetType: 'story' },
  })
  if (existing) return NextResponse.json(existing)

  const dep = await prisma.dependency.create({
    data: { sourceId, targetId, sourceType: 'story', targetType: 'story', type: 'depends_on' },
  })
  return NextResponse.json(dep, { status: 201 })
}
