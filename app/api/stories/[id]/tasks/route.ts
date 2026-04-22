import { NextResponse } from 'next/server'
import { createTask } from '@/src/infrastructure/db/projects'
import { prisma } from '@/src/infrastructure/db/client'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tasks = await prisma.task.findMany({ where: { storyId: id }, orderBy: { sequence: 'asc' } })
  return NextResponse.json(tasks)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  if (!body.title) return NextResponse.json({ error: 'title required' }, { status: 400 })
  const story = await prisma.userStory.findUnique({ where: { id }, select: { projectId: true } })
  if (!story) return NextResponse.json({ error: 'story not found' }, { status: 404 })
  const task = await createTask(story.projectId, id, body)
  return NextResponse.json(task, { status: 201 })
}
