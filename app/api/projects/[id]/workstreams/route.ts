import { NextResponse } from 'next/server'
import { listWorkstreams, upsertWorkstream } from '@/src/infrastructure/db/projects'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const workstreams = await listWorkstreams(id)
  return NextResponse.json(workstreams)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const workstream = await upsertWorkstream(id, body)
  return NextResponse.json(workstream, { status: 201 })
}
