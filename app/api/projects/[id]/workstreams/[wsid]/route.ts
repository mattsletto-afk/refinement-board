import { NextResponse } from 'next/server'
import { prisma } from '@/src/infrastructure/db/client'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; wsid: string }> }) {
  const { wsid } = await params
  const body = await req.json()
  const focusAreas = Array.isArray(body.focusAreas) ? (body.focusAreas as string[]).join(',') : undefined
  const row = await prisma.workstream.update({
    where: { id: wsid },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.color !== undefined && { color: body.color }),
      ...(body.description !== undefined && { description: body.description }),
      ...(focusAreas !== undefined && { focusAreas }),
    },
  })
  return NextResponse.json({
    id: row.id, name: row.name, color: row.color,
    description: (row as Record<string, unknown>).description ?? null,
    focusAreas: focusAreas ? focusAreas.split(',').filter(Boolean) : [],
  })
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; wsid: string }> }) {
  const { wsid } = await params
  await prisma.workstream.delete({ where: { id: wsid } })
  return new NextResponse(null, { status: 204 })
}
