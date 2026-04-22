import { NextResponse } from 'next/server'
import { prisma } from '@/src/infrastructure/db/client'

type Ctx = { params: Promise<{ id: string }> }

const ser = (f: { createdAt: Date; updatedAt: Date; [k: string]: unknown }) => ({
  ...f,
  createdAt: f.createdAt.toISOString(),
  updatedAt: f.updatedAt.toISOString(),
})

export async function GET(_: Request, { params }: Ctx) {
  const { id } = await params
  const features = await prisma.feature.findMany({
    where: { projectId: id },
    orderBy: [{ epicId: 'asc' }, { sequence: 'asc' }],
  })
  return NextResponse.json(features.map(ser))
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params
  const { title, description = '', status = 'backlog', priority = 'medium', epicId = null } =
    await req.json() as { title?: string; description?: string; status?: string; priority?: string; epicId?: string | null }
  if (!title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })
  const count = await prisma.feature.count({ where: { projectId: id, epicId: epicId ?? undefined } })
  const feature = await prisma.feature.create({
    data: { projectId: id, title: title.trim(), description, status, priority, epicId, sequence: count, score: 0 },
  })
  return NextResponse.json(ser(feature), { status: 201 })
}
