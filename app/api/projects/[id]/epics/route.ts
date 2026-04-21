import { NextResponse } from 'next/server'
import { prisma } from '@/src/infrastructure/db/client'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const epics = await prisma.epic.findMany({
    where: { projectId: id },
    orderBy: [{ sequence: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
  })
  return NextResponse.json(epics.map(e => ({ ...e, createdAt: e.createdAt.toISOString(), updatedAt: e.updatedAt.toISOString() })))
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { title, description = '', status = 'active', priority = 'medium' } = await req.json() as { title?: string; description?: string; status?: string; priority?: string }
  if (!title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })
  const agg = await prisma.epic.aggregate({ where: { projectId: id }, _max: { sequence: true } })
  const nextSeq = (agg._max.sequence ?? -1) + 1
  const epic = await prisma.epic.create({
    data: { projectId: id, title: title.trim(), description, status, priority, sequence: nextSeq, score: 0, tags: '', notes: '' },
  })
  return NextResponse.json({ ...epic, createdAt: epic.createdAt.toISOString(), updatedAt: epic.updatedAt.toISOString() }, { status: 201 })
}
