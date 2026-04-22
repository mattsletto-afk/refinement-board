import { NextResponse } from 'next/server'
import { removePlacement } from '@/src/infrastructure/db/personas'

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; pid: string }> }) {
  const { pid } = await params
  await removePlacement(pid)
  return new NextResponse(null, { status: 204 })
}
