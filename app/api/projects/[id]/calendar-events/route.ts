import { NextResponse } from 'next/server'
import { listCalendarEvents, createCalendarEvent } from '@/src/infrastructure/db/calendarEvents'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return NextResponse.json(await listCalendarEvents(id))
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  if (!body.title || !body.date || body.startHour === undefined)
    return NextResponse.json({ error: 'title, date and startHour required' }, { status: 400 })
  const event = await createCalendarEvent(id, body)
  return NextResponse.json(event, { status: 201 })
}
