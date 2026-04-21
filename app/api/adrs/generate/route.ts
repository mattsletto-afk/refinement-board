import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import {
  buildAdrPrompt,
  parseAdrLlmResponse,
  createAdr,
} from '@/src/domain/adr/adrService'
import type { GenerateAdrInput } from '@/src/domain/adr/types'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body: unknown = await request.json()

  if (
    typeof body !== 'object' ||
    body === null ||
    !('title' in body) ||
    !('context' in body) ||
    !('optionsConsidered' in body) ||
    !('decisionDrivers' in body)
  ) {
    return NextResponse.json(
      {
        error:
          'title, context, optionsConsidered, and decisionDrivers are required',
      },
      { status: 400 }
    )
  }

  const obj = body as Record<string, unknown>

  if (
    typeof obj.title !== 'string' ||
    typeof obj.context !== 'string' ||
    !Array.isArray(obj.optionsConsidered) ||
    !Array.isArray(obj.decisionDrivers)
  ) {
    return NextResponse.json(
      { error: 'Invalid field types' },
      { status: 400 }
    )
  }

  const optionsConsidered = obj.optionsConsidered as unknown[]
  const decisionDrivers = obj.decisionDrivers as unknown[]

  if (
    !optionsConsidered.every((o) => typeof o === 'string') ||
    !decisionDrivers.every((d) => typeof d === 'string')
  ) {
    return NextResponse.json(
      { error: 'optionsConsidered and decisionDrivers must be string arrays' },
      { status: 400 }
    )
  }

  const input: GenerateAdrInput = {
    title: obj.title,
    context: obj.context,
    optionsConsidered: optionsConsidered as string[],
    decisionDrivers: decisionDrivers as string[],
    storyId: typeof obj.storyId === 'string' ? obj.storyId : undefined,
    agentRunId:
      typeof obj.agentRunId === 'string' ? obj.agentRunId : undefined,
  }

  const prompt = buildAdrPrompt(input)

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const textBlock = message.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    return NextResponse.json(
      { error: 'No text response from LLM' },
      { status: 502 }
    )
  }

  let parsed: { decision: string; consequences: string }
  try {
    parsed = parseAdrLlmResponse(textBlock.text)
  } catch {
    return NextResponse.json(
      { error: 'Failed to parse LLM response as ADR' },
      { status: 502 }
    )
  }

  const adr = await createAdr({
    title: input.title,
    context: input.context,
    decision: parsed.decision,
    consequences: parsed.consequences,
    status: 'proposed',
    storyId: input.storyId,
    agentRunId: input.agentRunId,
  })

  return NextResponse.json(adr, { status: 201 })
}
