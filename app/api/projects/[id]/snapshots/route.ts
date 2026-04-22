import { NextResponse } from 'next/server'
import { listSnapshots, createSnapshot } from '@/src/infrastructure/db/projects'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const snapshots = await listSnapshots(id)
  return NextResponse.json(snapshots)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const snapshot = await createSnapshot(id, body.name, body.description)
  return NextResponse.json(snapshot, { status: 201 })
}
