import { NextResponse } from 'next/server'
import { updateStory, deleteStory } from '@/src/infrastructure/db/projects'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const story = await updateStory(id, body)
  return NextResponse.json(story)
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await deleteStory(id)
  return NextResponse.json({ ok: true })
}
