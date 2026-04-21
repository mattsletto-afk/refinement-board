import { NextResponse } from 'next/server'
import { prisma } from '@/src/infrastructure/db/client'
import { listPlacements, addPlacement, removePlacement, reorderPlacements } from '@/src/infrastructure/db/personas'

// GET /api/personas/[id]/placements — list all project placements for a persona
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rows = await prisma.projectPersonaPlacement.findMany({
    where: { personaId: id },
    include: { workstream: true },
    orderBy: { sequence: 'asc' },
  })
  return NextResponse.json(rows)
}

// POST /api/personas/[id]/placements — place persona in a project (and optionally workstream)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  if (!body.projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  const placement = await addPlacement(body.projectId, id, body.workstreamId ?? null, body.sequence)
  return NextResponse.json(placement, { status: 201 })
}
