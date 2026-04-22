import { NextResponse } from 'next/server'
import { listStories, createStory } from '@/src/infrastructure/db/projects'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const stories = await listStories(id)
  return NextResponse.json(stories, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  if (!body.title) return NextResponse.json({ error: 'title required' }, { status: 400 })
  const story = await createStory(id, body)
  return NextResponse.json(story, { status: 201 })
}
