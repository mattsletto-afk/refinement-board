import { NextResponse } from 'next/server'
import { prisma } from '@/src/infrastructure/db/client'

type Ctx = { params: Promise<{ id: string }> }

const ser = (e: { createdAt: Date; updatedAt: Date; [k: string]: unknown }) => ({
  ...e,
  createdAt: e.createdAt.toISOString(),
  updatedAt: e.updatedAt.toISOString(),
})

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params
  const body = await req.json() as Record<string, unknown>
  const allowed = ['title', 'description', 'status', 'priority', 'estimate', 'score', 'tags', 'notes', 'sequence', 'workstreamId', 'committed']
  const data: Record<string, unknown> = {}
  for (const k of allowed) if (k in body) data[k] = body[k]
  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'no fields' }, { status: 400 })
  const epic = await prisma.epic.update({ where: { id }, data })
  return NextResponse.json(ser(epic))
}

export async function DELETE(_: Request, { params }: Ctx) {
  const { id } = await params
  await prisma.epic.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
