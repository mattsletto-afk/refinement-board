import { prisma } from '@/src/infrastructure/db/client'
import type { AdrRecord, CreateAdrInput, GenerateAdrInput } from './types'

async function nextAdrNumber(): Promise<number> {
  const latest = await prisma.architectureDecisionRecord.findFirst({
    orderBy: { number: 'desc' },
    select: { number: true },
  })
  return (latest?.number ?? 0) + 1
}

export async function createAdr(input: CreateAdrInput): Promise<AdrRecord> {
  const number = await nextAdrNumber()
  const record = await prisma.architectureDecisionRecord.create({
    data: {
      number,
      title: input.title,
      status: input.status ?? 'proposed',
      context: input.context,
      decision: input.decision,
      consequences: input.consequences,
      storyId: input.storyId ?? null,
      agentRunId: input.agentRunId ?? null,
    },
  })
  return record as AdrRecord
}

export async function listAdrs(): Promise<AdrRecord[]> {
  const records = await prisma.architectureDecisionRecord.findMany({
    orderBy: { number: 'asc' },
  })
  return records as AdrRecord[]
}

export async function getAdr(id: string): Promise<AdrRecord | null> {
  const record = await prisma.architectureDecisionRecord.findUnique({
    where: { id },
  })
  return record as AdrRecord | null
}

export async function updateAdrStatus(
  id: string,
  status: string
): Promise<AdrRecord> {
  const record = await prisma.architectureDecisionRecord.update({
    where: { id },
    data: { status },
  })
  return record as AdrRecord
}

export function buildAdrPrompt(input: GenerateAdrInput): string {
  const optionsList = input.optionsConsidered
    .map((o, i) => `${i + 1}. ${o}`)
    .join('\n')
  const driversList = input.decisionDrivers
    .map((d) => `- ${d}`)
    .join('\n')

  return `You are a senior software architect. Generate an Architecture Decision Record (ADR) in structured JSON format.

Title: ${input.title}

Decision Drivers:
${driversList}

Options Considered:
${optionsList}

Respond with a JSON object with exactly these fields:
- "decision": A clear statement of the decision made and which option was chosen (2-4 sentences)
- "consequences": The positive and negative consequences of this decision (3-6 bullet points as a single string with newlines)

Context for the decision:
${input.context}

Respond ONLY with the JSON object, no markdown, no explanation.`
}

export function parseAdrLlmResponse(raw: string): {
  decision: string
  consequences: string
} {
  const trimmed = raw.trim()
  const jsonStart = trimmed.indexOf('{')
  const jsonEnd = trimmed.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('LLM response did not contain a JSON object')
  }
  const jsonStr = trimmed.slice(jsonStart, jsonEnd + 1)
  const parsed: unknown = JSON.parse(jsonStr)
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('decision' in parsed) ||
    !('consequences' in parsed)
  ) {
    throw new Error('LLM response missing required ADR fields')
  }
  const obj = parsed as Record<string, unknown>
  if (typeof obj.decision !== 'string' || typeof obj.consequences !== 'string') {
    throw new Error('ADR fields must be strings')
  }
  return {
    decision: obj.decision,
    consequences: obj.consequences,
  }
}
