import { NextRequest, NextResponse } from 'next/server'
import { getAdr, updateAdrStatus } from '@/src/domain/adr/adrService'

type Params = { params: Promise<{ id: string }> }

export async function GET(
  _request: NextRequest,
  { params }: Params
): Promise<NextResponse> {
  const { id } = await params
  const adr = await getAdr(id)
  if (!adr) {
    return NextResponse.json({ error: 'ADR not found' }, { status: 404 })
  }
  return NextResponse.json(adr)
}

export async function PATCH(
  request: NextRequest,
  { params }: Params
): Promise<NextResponse> {
  const { id } = await params
  const body: unknown = await request.json()

  if (
    typeof body !== 'object' ||
    body === null ||
    !('status' in body) ||
    typeof (body as Record<string, unknown>).status !== 'string'
  ) {
    return NextResponse.json(
      { error: 'status field is required and must be a string' },
      { status: 400 }
    )
  }

  const existing = await getAdr(id)
  if (!existing) {
    return NextResponse.json({ error: 'ADR not found' }, { status: 404 })
  }

  const status = (body as Record<string, unknown>).status as string
  const adr = await updateAdrStatus(id, status)
  return NextResponse.json(adr)
}
