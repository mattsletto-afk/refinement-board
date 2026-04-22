import { NextResponse } from 'next/server'
import { prisma } from '@/src/infrastructure/db/client'

type Ctx = { params: Promise<{ id: string }> }

const ser = (f: { createdAt: Date; updatedAt: Date; [k: string]: unknown }) => ({
  ...f,
  createdAt: f.createdAt.toISOString(),
  updatedAt: f.updatedAt.toISOString(),
})

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params
  const body = await req.json() as Record<string, unknown>
  const allowed = ['title', 'description', 'status', 'priority', 'estimate', 'score', 'tags', 'notes', 'sequence', 'epicId', 'workstreamId', 'committed']
  const data: Record<string, unknown> = {}
  for (const k of allowed) if (k in body) data[k] = body[k]
  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'no fields' }, { status: 400 })
  const feature = await prisma.feature.update({ where: { id }, data })
  return NextResponse.json(ser(feature))
}

export async function DELETE(_: Request, { params }: Ctx) {
  const { id } = await params
  await prisma.feature.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
