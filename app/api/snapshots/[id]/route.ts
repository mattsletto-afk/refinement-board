import { NextResponse } from 'next/server'
import { getSnapshot } from '@/src/infrastructure/db/projects'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const snapshot = await getSnapshot(id)
  if (!snapshot) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(snapshot)
}
