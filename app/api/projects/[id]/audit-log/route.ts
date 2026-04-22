import { NextRequest, NextResponse } from 'next/server'
import { queryAuditLog, verifyAuditChain } from '@/src/infrastructure/db/auditLog'
import type { AuditEventType } from '@/src/infrastructure/db/auditLog'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params
  const { searchParams } = req.nextUrl

  const verify  = searchParams.get('verify') === 'true'
  const eventType = searchParams.get('eventType') as AuditEventType | null
  const runId   = searchParams.get('runId') ?? undefined
  const limit   = Math.min(Number(searchParams.get('limit')  ?? 100), 500)
  const offset  = Number(searchParams.get('offset') ?? 0)

  if (verify) {
    const result = await verifyAuditChain(projectId)
    return NextResponse.json(result)
  }

  const entries = await queryAuditLog({
    projectId,
    eventType: eventType ?? undefined,
    runId,
    limit,
    offset,
  })

  return NextResponse.json(entries)
}
