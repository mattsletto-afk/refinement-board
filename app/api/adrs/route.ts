import { NextRequest, NextResponse } from 'next/server'
import { createAdr, listAdrs } from '@/src/domain/adr/adrService'
import type { CreateAdrInput } from '@/src/domain/adr/types'

export async function GET(): Promise<NextResponse> {
  const adrs = await listAdrs()
  return NextResponse.json(adrs)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body: unknown = await request.json()

  if (
    typeof body !== 'object' ||
    body === null ||
    !('title' in body) ||
    !('context' in body) ||
    !('decision' in body) ||
    !('consequences' in body)
  ) {
    return NextResponse.json(
      { error: 'title, context, decision, and consequences are required' },
      { status: 400 }
    )
  }

  const obj = body as Record<string, unknown>

  if (
    typeof obj.title !== 'string' ||
    typeof obj.context !== 'string' ||
    typeof obj.decision !== 'string' ||
    typeof obj.consequences !== 'string'
  ) {
    return NextResponse.json(
      { error: 'All required fields must be strings' },
      { status: 400 }
    )
  }

  const input: CreateAdrInput = {
    title: obj.title,
    context: obj.context,
    decision: obj.decision,
    consequences: obj.consequences,
    status:
      typeof obj.status === 'string'
        ? (obj.status as CreateAdrInput['status'])
        : 'proposed',
    storyId: typeof obj.storyId === 'string' ? obj.storyId : undefined,
    agentRunId:
      typeof obj.agentRunId === 'string' ? obj.agentRunId : undefined,
  }

  const adr = await createAdr(input)
  return NextResponse.json(adr, { status: 201 })
}
