import { prisma } from './client'
import type { CalendarEvent, CalendarEventStoryLink } from '@/src/domain/types'

type RawEvent = Awaited<ReturnType<typeof prisma.calendarEvent.findFirst>> & {
  personas?: { personaId: string }[]
  stories?: { storyId: string; role: string; story: { id: string; title: string; status: string; finalScore?: number } }[]
}

function shape(e: NonNullable<RawEvent>): CalendarEvent {
  return {
    id: e.id,
    projectId: e.projectId,
    date: e.date,
    startHour: e.startHour,
    durationMins: e.durationMins,
    title: e.title,
    type: e.type as CalendarEvent['type'],
    notes: e.notes ?? null,
    transcript: e.transcript ?? null,
    recurrence: e.recurrence ? JSON.parse(e.recurrence) : null,
    personaIds: (e as { personas?: { personaId: string }[] }).personas?.map(p => p.personaId) ?? [],
    eventStories: ((e as { stories?: unknown[] }).stories ?? []) as CalendarEventStoryLink[],
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  }
}

const INCLUDE = {
  personas: true,
  stories: { include: { story: { select: { id: true, title: true, status: true, finalScore: true } } } },
} as const

export async function listCalendarEvents(projectId: string): Promise<CalendarEvent[]> {
  const rows = await prisma.calendarEvent.findMany({
    where: { projectId },
    orderBy: [{ date: 'asc' }, { startHour: 'asc' }],
    include: INCLUDE,
  })
  return rows.map(r => shape(r as NonNullable<RawEvent>))
}

export async function getCalendarEvent(id: string): Promise<CalendarEvent | null> {
  const row = await prisma.calendarEvent.findUnique({ where: { id }, include: INCLUDE })
  return row ? shape(row as NonNullable<RawEvent>) : null
}

export async function createCalendarEvent(
  projectId: string,
  data: {
    date: string; startHour: number; durationMins?: number; title: string
    type?: string; notes?: string; recurrence?: unknown; personaIds?: string[]
  }
): Promise<CalendarEvent> {
  const row = await prisma.calendarEvent.create({
    data: {
      projectId,
      date: data.date,
      startHour: data.startHour,
      durationMins: data.durationMins ?? 0,
      title: data.title,
      type: data.type ?? 'meeting',
      notes: data.notes ?? null,
      recurrence: data.recurrence ? JSON.stringify(data.recurrence) : null,
      personas: data.personaIds?.length
        ? { create: data.personaIds.map(pid => ({ personaId: pid })) }
        : undefined,
    },
    include: INCLUDE,
  })
  return shape(row as NonNullable<RawEvent>)
}

export async function updateCalendarEvent(
  id: string,
  data: Partial<{
    title: string; type: string; durationMins: number; notes: string | null
    transcript: string | null; recurrence: unknown; personaIds: string[]
  }>
): Promise<CalendarEvent> {
  if (data.personaIds !== undefined) {
    await prisma.calendarEventPersona.deleteMany({ where: { eventId: id } })
    if (data.personaIds.length) {
      await prisma.calendarEventPersona.createMany({
        data: data.personaIds.map(pid => ({ eventId: id, personaId: pid })),
      })
    }
  }
  const row = await prisma.calendarEvent.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.durationMins !== undefined && { durationMins: data.durationMins }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.transcript !== undefined && { transcript: data.transcript }),
      ...(data.recurrence !== undefined && { recurrence: data.recurrence ? JSON.stringify(data.recurrence) : null }),
    },
    include: INCLUDE,
  })
  return shape(row as NonNullable<RawEvent>)
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  await prisma.calendarEvent.delete({ where: { id } })
}

export async function linkStoryToEvent(eventId: string, storyId: string, role = 'discussed'): Promise<void> {
  await prisma.calendarEventStory.upsert({
    where: { eventId_storyId: { eventId, storyId } },
    create: { eventId, storyId, role },
    update: { role },
  })
}

export async function unlinkStoryFromEvent(eventId: string, storyId: string): Promise<void> {
  await prisma.calendarEventStory.deleteMany({ where: { eventId, storyId } })
}
