import { NextResponse } from 'next/server'
import { startFresh } from '@/src/infrastructure/db/projects'
import type { CarryForwardKey } from '@/src/domain/archive'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const snapshotName: string = body.snapshotName ?? `Snapshot ${new Date().toLocaleDateString()}`
  const carryForward: CarryForwardKey[] = body.carryForward ?? []
  const result = await startFresh(id, snapshotName, carryForward)
  return NextResponse.json(result, { status: 200 })
}
