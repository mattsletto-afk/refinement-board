import type { AgentMemoryRecord } from '@/src/infrastructure/db/agentMemory'

export interface ScorecardShape {
  actionsCount?: number
  appliedCount?: number
  skippedCount?: number
  summary?: string
  [key: string]: unknown
}

/**
 * Builds the memory context block to inject into the agent system/user prompt.
 * Returns an empty string if there are no prior runs (graceful empty-history).
 * Designed to be fast — pure string manipulation, <1ms per call.
 */
export function buildMemoryContext(records: AgentMemoryRecord[]): string {
  if (!records || records.length === 0) {
    return ''
  }

  const lines: string[] = ['## Prior Run Memory (newest first)', '']

  for (const record of records) {
    let parsed: ScorecardShape & { actionsCount?: number } = {}
    try {
      parsed = JSON.parse(record.content) as ScorecardShape & { actionsCount?: number }
    } catch {
      parsed = { summary: record.content }
    }

    lines.push(`### Run: ${record.runId ?? 'unknown'} (${record.createdAt.toISOString()})`)
    if (parsed.actionsCount !== undefined) {
      lines.push(`- Actions taken: ${parsed.actionsCount}`)
    }

    if (parsed.summary) {
      lines.push(`- Summary: ${parsed.summary}`)
    }
    if (parsed.appliedCount !== undefined) {
      lines.push(`- Applied: ${parsed.appliedCount}`)
    }
    if (parsed.skippedCount !== undefined) {
      lines.push(`- Skipped: ${parsed.skippedCount}`)
    }

    lines.push('')
  }

  lines.push(
    '> Use this history to avoid repeating identical actions and to evolve prior work.',
    '',
  )

  return lines.join('\n')
}

/**
 * Injects the memory context block at the start of a user prompt string.
 * If context is empty (no prior runs), the prompt is returned unchanged.
 */
export function injectMemoryIntoPrompt(prompt: string, memoryContext: string): string {
  if (!memoryContext) return prompt
  return `${memoryContext}\n---\n\n${prompt}`
}
