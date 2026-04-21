import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export interface WizardField {
  key: string
  label: string
  value: string
}

export interface WizardData {
  name: string
  description: string
  techSpecs: string
  roles: string       // one per line: "Title (N) — responsibilities"
  epics: string       // one per line
  timeline: string
  constraints: string
}

const FIELDS: Array<{ key: keyof WizardData; label: string }> = [
  { key: 'name',        label: 'Project Name' },
  { key: 'description', label: 'Description' },
  { key: 'techSpecs',   label: 'Technical Specifications' },
  { key: 'roles',       label: 'Team Roles' },
  { key: 'epics',       label: 'Initial Epics' },
  { key: 'timeline',    label: 'Timeline' },
  { key: 'constraints', label: 'Constraints' },
]
export { FIELDS }

const SYSTEM = `You are a project planning assistant. Given a brief description of a project, generate realistic seed data for a project planning tool.

Return ONLY valid JSON matching this exact shape (no markdown, no preamble):
{
  "name": "Short project name (3-6 words)",
  "description": "2-3 sentence description of the project goals and scope",
  "techSpecs": "Concise technical stack and architecture overview — language, frameworks, infra, key integrations (3-5 bullet points joined by newlines)",
  "roles": "One role per line in format: Title (N) — key responsibilities. List 3-6 roles with realistic headcount.",
  "epics": "One epic title per line. List 4-7 high-level epics that capture the main work streams.",
  "timeline": "Overall timeline with key phases, e.g. Phase 1 (weeks 1-4): ..., Phase 2 (weeks 5-8): ...",
  "constraints": "Key constraints and assumptions (budget, team, scope, compliance) — 3-5 bullet points joined by newlines"
}`

/**
 * POST /api/projects/wizard/generate
 * Body: { intent: string } → returns WizardData
 * Body: { intent: string, field: keyof WizardData, currentData: WizardData } → returns { [field]: newValue }
 */
export async function POST(req: Request): Promise<NextResponse> {
  const body = await req.json() as { intent: string; field?: keyof WizardData; currentData?: WizardData }
  const { intent, field, currentData } = body

  if (!intent?.trim()) return NextResponse.json({ error: 'intent required' }, { status: 400 })

  const client = new Anthropic()

  // Regenerate single field
  if (field && currentData) {
    const fieldLabel = FIELDS.find(f => f.key === field)?.label ?? field
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: `You are a project planning assistant. Regenerate only the "${fieldLabel}" field for a project.
Return ONLY valid JSON with a single key "${field}" and the regenerated value. No preamble, no markdown.`,
      messages: [{
        role: 'user',
        content: `Project intent: ${intent}\n\nCurrent data context:\n${JSON.stringify(currentData, null, 2)}\n\nRegenerate the "${fieldLabel}" field with a fresh alternative.`
      }],
    })
    const text = message.content.filter(b => b.type === 'text').map(b => b.text).join('')
    try {
      const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text)
      return NextResponse.json(parsed)
    } catch {
      return NextResponse.json({ error: 'failed to parse regenerated field' }, { status: 500 })
    }
  }

  // Generate all fields
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: 'user', content: `Project intent: ${intent}` }],
  })

  const text = message.content.filter(b => b.type === 'text').map(b => b.text).join('')
  try {
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text) as WizardData
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'failed to parse generated data' }, { status: 500 })
  }
}
