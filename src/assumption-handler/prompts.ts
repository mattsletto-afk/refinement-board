import type { Assumption, AssumptionHandlerRequest, PromptContext } from './types'
import { isRedField } from './policy'

const BLOCKED_CATEGORIES = ['pricing', 'budget', 'compliance', 'legal', 'security', 'kpi', 'revenue']

// ── New-spec three-prompt builders ────────────────────────────────────────────

export function buildSystemPrompt(): string {
  return `You are Assumption Handler (alias: Oracle), a narrow internal agent for simulation and planning environments.

ROLE: When inputs are missing, detect the gaps, propose safe synthetic placeholders, and return structured JSON.

STRICT RULES:
1. Return ONLY valid JSON. No prose, no markdown, no explanations outside the JSON structure.
2. NEVER invent: ${BLOCKED_CATEGORIES.join(', ')}. If asked, block the field with a clear reason.
3. Mark every proposed value with "synthetic": true. Synthetic data is never real data.
4. Do not overwrite any field present in existingVerifiedValues.
5. Use conservative, plausible assumptions. Prefer simulation continuity over certainty.
6. If a field cannot be safely assumed, block it — do not guess.
7. Assign confidence honestly: high = well-supported by context, medium = plausible, low = speculative.
8. Rationale must explain the reasoning, not just describe the value.

YOU ARE NOT A CHATBOT. You produce structured JSON for a machine to process.`
}

export function buildDeveloperPrompt(request: AssumptionHandlerRequest): string {
  const redFields = request.fields
    .filter(f => isRedField(f.path))
    .map(f => f.path)

  const maxNote = request.maxAssumptions
    ? `Maximum assumptions to propose: ${request.maxAssumptions}.`
    : 'No assumption limit — propose for all eligible fields.'

  const modeNote = `Application mode: ${request.appMode}. Auto-apply is ${
    ['simulation', 'demo', 'testing'].includes(request.appMode)
      ? 'permitted for green fields'
      : 'DISABLED in production mode'
  }.`

  const verifiedNote =
    request.existingVerifiedValues && Object.keys(request.existingVerifiedValues).length > 0
      ? `Verified fields (DO NOT overwrite): ${Object.keys(request.existingVerifiedValues).join(', ')}`
      : 'No existing verified values.'

  const redNote =
    redFields.length > 0
      ? `Red fields detected (MUST be blocked, not assumed): ${redFields.join(', ')}`
      : 'No red fields in this request.'

  return `${modeNote}
${maxNote}
${verifiedNote}
${redNote}

Response schema (AssumptionHandlerResponse):
{
  "requestId": string,
  "assumptions": Array<{ field, proposedValue, confidence, rationale, "synthetic": true, source }>,
  "blocked": Array<{ field, reason, level }>,
  "synthetic": Array<{ field, value, "synthetic": true, confidence, label }>,
  "warnings": string[]
}`
}

export function buildUserPrompt(request: AssumptionHandlerRequest): string {
  const fieldLines = request.fields
    .map(f => {
      const parts = [
        `  - path: "${f.path}"`,
        `    severity: ${f.severity}`,
        `    currentValue: ${JSON.stringify(f.currentValue)}`,
      ]
      if (f.context) parts.push(`    context: "${f.context}"`)
      return parts.join('\n')
    })
    .join('\n')

  const contextLines = Object.entries(request.context)
    .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
    .join('\n')

  return `Request ID: ${request.requestId}

Unknown fields requiring assumption:
${fieldLines}

Project context:
${contextLines}

Return only JSON matching the AssumptionHandlerResponse schema.`
}

// ── Legacy prompt builders (preserved) ───────────────────────────────────────

export const ASSUMPTION_SYSTEM_PROMPT = `You are an expert project analyst reviewing assumptions about software project entities.

Your role is to evaluate proposed changes to project data fields and determine whether each assumption:
1. Is factually reasonable given the context
2. Represents an improvement over the current value
3. Carries any risks or dependencies that should be flagged

Respond in structured JSON only. No prose outside the JSON object.`

export function buildEvaluationPrompt(ctx: PromptContext): string {
  const lines: string[] = [
    `Project ID: ${ctx.projectId}`,
    `Entity type: ${ctx.entityType}`,
    `Field: ${ctx.field}`,
    `Current value: ${JSON.stringify(ctx.currentValue)}`,
    `Proposed value: ${JSON.stringify(ctx.proposedValue)}`,
    `Rationale: ${ctx.rationale}`,
  ]

  if (ctx.existingAssumptions && ctx.existingAssumptions.length > 0) {
    lines.push('\nExisting assumptions on this entity:')
    for (const a of ctx.existingAssumptions) {
      lines.push(`  - [${a.status}] ${a.field}: ${JSON.stringify(a.proposedValue)} (${a.confidence} confidence)`)
    }
  }

  lines.push(`
Evaluate this assumption and respond with a JSON object matching this schema:
{
  "reasonable": boolean,
  "improves": boolean,
  "risks": string[],
  "suggestedConfidence": "high" | "medium" | "low",
  "notes": string
}`)

  return lines.join('\n')
}

export function buildBatchSummaryPrompt(assumptions: Assumption[], projectId: string): string {
  const eligible = assumptions.filter(a => a.status === 'unverified')
  const grouped = groupBy(eligible, a => a.entityType)

  const summary = Object.entries(grouped)
    .map(([type, items]) => `  ${type}: ${items.length} unverified assumptions`)
    .join('\n')

  return `You are reviewing unverified project assumptions for project ${projectId}.

Summary:
${summary}

Total: ${eligible.length} assumptions pending review.

Identify which assumptions are most critical to resolve first and explain why. Respond with JSON:
{
  "prioritized": [{ "assumptionId": string, "reason": string }],
  "notes": string
}`
}

export function buildPatchJustificationPrompt(assumption: Assumption): string {
  return `An assumption is about to be auto-applied to a project entity.

Entity type: ${assumption.entityType}
Field: ${assumption.field}
Current value: ${JSON.stringify(assumption.currentValue)}
Proposed value: ${JSON.stringify(assumption.proposedValue)}
Rationale: ${assumption.rationale}
Confidence: ${assumption.confidence}

Confirm this patch is safe. Respond with JSON:
{
  "safe": boolean,
  "concern": string | null
}`
}

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item)
    if (!acc[k]) acc[k] = []
    acc[k].push(item)
    return acc
  }, {})
}
