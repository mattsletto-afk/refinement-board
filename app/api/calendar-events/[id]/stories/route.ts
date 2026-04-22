import { NextResponse } from 'next/server'
import { linkStoryToEvent, unlinkStoryFromEvent, getCalendarEvent } from '@/src/infrastructure/db/calendarEvents'
import { createStory } from '@/src/infrastructure/db/projects'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  // If a title is passed, create a new story and link it
  if (body.title) {
    const event = await getCalendarEvent(id)
    if (!event) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const story = await createStory(event.projectId, { title: body.title })
    await linkStoryToEvent(id, story.id, body.role ?? 'created')
    return NextResponse.json({ storyId: story.id }, { status: 201 })
  }

  if (!body.storyId) return NextResponse.json({ error: 'storyId required' }, { status: 400 })
  await linkStoryToEvent(id, body.storyId, body.role ?? 'discussed')
  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { storyId } = await req.json()
  if (!storyId) return NextResponse.json({ error: 'storyId required' }, { status: 400 })
  await unlinkStoryFromEvent(id, storyId)
  return new NextResponse(null, { status: 204 })
}
