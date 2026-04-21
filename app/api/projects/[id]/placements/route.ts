import { NextResponse } from 'next/server'
import { listPlacements, addPlacement, reorderPlacements } from '@/src/infrastructure/db/personas'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return NextResponse.json(await listPlacements(id))
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { personaId, workstreamId, sequence } = await req.json()
  if (!personaId) return NextResponse.json({ error: 'personaId required' }, { status: 400 })
  const placement = await addPlacement(id, personaId, workstreamId ?? null, sequence)
  return NextResponse.json(placement, { status: 201 })
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await params
  const updates: { id: string; workstreamId: string | null; sequence: number }[] = await req.json()
  await reorderPlacements(updates)
  return new NextResponse(null, { status: 204 })
}
