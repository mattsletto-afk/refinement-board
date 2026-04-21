import { NextRequest, NextResponse } from 'next/server'
import {
  validatePipelineResultPayload,
  parsePipelineResultPayload,
} from '@/src/domain/ci-pipeline/ciPipelineValidator'
import {
  recordPipelineResult,
  listRecentPipelineResults,
} from '@/src/domain/ci-pipeline/ciPipelineService'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const expectedToken = process.env.BOARD_API_TOKEN

  if (expectedToken && token !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { valid, errors } = validatePipelineResultPayload(body)
  if (!valid) {
    return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 422 })
  }

  const payload = parsePipelineResultPayload(body)
  const record = await recordPipelineResult(payload)

  return NextResponse.json(
    { success: true, id: record.id, overallStatus: record.overallStatus },
    { status: 201 }
  )
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? parseInt(limitParam, 10) : 20

  if (isNaN(limit) || limit < 1 || limit > 100) {
    return NextResponse.json({ error: 'limit must be between 1 and 100' }, { status: 400 })
  }

  const results = await listRecentPipelineResults(limit)
  return NextResponse.json({ results })
}
