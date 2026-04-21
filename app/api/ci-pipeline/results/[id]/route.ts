import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/infrastructure/db/client'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (prisma as any).cIPipelineResult.findUnique({ where: { id } })

  if (!result) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ result })
}
