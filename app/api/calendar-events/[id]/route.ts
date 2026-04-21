import { NextResponse } from 'next/server'
import { getCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from '@/src/infrastructure/db/calendarEvents'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const event = await getCalendarEvent(id)
  if (!event) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(event)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  return NextResponse.json(await updateCalendarEvent(id, body))
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await deleteCalendarEvent(id)
  return new NextResponse(null, { status: 204 })
}
