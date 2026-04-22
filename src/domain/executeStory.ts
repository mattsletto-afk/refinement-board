import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { prisma } from '@/src/infrastructure/db/client'

// ── System prompt ──────────────────────────────────────────────────────────────

const EXECUTION_SYSTEM_PROMPT = `You are a senior TypeScript engineer implementing a specific user story for the "Refinement Board" project — a Next.js project planning tool with an AI simulation system.

## Your task
Read the story title, acceptance criteria (AC), and tasks carefully. Implement exactly what is described — no more, no less.

## Project stack
- Next.js 16.2.4 with App Router (file-based routing in app/)
- TypeScript strict mode
- Prisma ORM with SQLite (adapter: better-sqlite3)
- Anthropic SDK (@anthropic-ai/sdk)
- Vitest for testing
- DB client: import { prisma } from '@/src/infrastructure/db/client'
- Next.js route handlers use: export async function POST(req: Request, { params }: { params: Promise<{ id: string }> })

## Conventions to follow
- All route params are Promises — always await params before accessing fields
- Use NextResponse.json() for responses
- Prisma models: UserStory (table name), Task, Epic, Feature, Workstream, etc.
- Story status values: 'backlog' | 'active' | 'done' | 'archived'
- Task status values: 'todo' | 'in-progress' | 'done' | 'blocked'
- Priority values: 'critical' | 'high' | 'medium' | 'low'
- File paths in the project use @/ aliasing to the project root
- Keep imports clean — no unused imports

## Output rules
- Include at least one test file (*.test.ts) if implementing a new module or service
- Test files use Vitest: import { describe, it, expect, vi } from 'vitest'
- File paths must be relative to the project root (e.g., "app/api/...", "src/domain/...")
- Keep changes scoped to what the story requires

## CRITICAL: Output format
You MUST output ONLY a single valid JSON object. No markdown, no explanation, no code fences outside the JSON.

The JSON must have this exact shape:
{
  "summary": "one-paragraph summary of what was implemented",
  "files": [
    {
      "path": "relative/path/from/project/root/file.ts",
      "content": "full file content as a string"
    }
  ],
  "storyStatus": "done",
  "completionNotes": "any caveats, assumptions, or follow-up items"
}`

// ── Context loader ─────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.join(process.cwd())

function safeReadFile(filePath: string, maxLines?: number): string {
  try {
    const full = fs.readFileSync(path.join(PROJECT_ROOT, filePath), 'utf-8')
    if (!maxLines) return full
    return full.split('\n').slice(0, maxLines).join('\n')
  } catch {
    return ''
  }
}

function loadContextForWorkstream(workstreamName: string | null): string {
  const ws = (workstreamName ?? '').toLowerCase()
  const sections: string[] = []

  if (ws.includes('agent execution') || ws.includes('simulation loop') || ws.includes('execution engine')) {
    const runRoute = safeReadFile('app/api/simulations/[sid]/run/route.ts', 100)
    if (runRoute) sections.push(`// app/api/simulations/[sid]/run/route.ts (first 100 lines)\n${runRoute}`)
    const types = safeReadFile('src/domain/types.ts', 30)
    if (types) sections.push(`// src/domain/types.ts (first 30 lines)\n${types}`)
  } else if (ws.includes('board integration')) {
    const schema = safeReadFile('prisma/schema.prisma', 80)
    if (schema) sections.push(`// prisma/schema.prisma (first 80 lines)\n${schema}`)
    const types = safeReadFile('src/domain/types.ts', 30)
    if (types) sections.push(`// src/domain/types.ts (first 30 lines)\n${types}`)
  } else if (ws.includes('infrastructure')) {
    const pkg = safeReadFile('package.json')
    if (pkg) sections.push(`// package.json\n${pkg}`)
    try {
      const githubFiles = fs.readdirSync(path.join(PROJECT_ROOT, '.github')).join(', ')
      sections.push(`// .github/ contents: ${githubFiles}`)
    } catch { /* no .github dir */ }
  } else if (ws.includes('safety') || ws.includes('governance')) {
    const policy = safeReadFile('src/domain/autoApply/policy.ts')
    if (policy) sections.push(`// src/domain/autoApply/policy.ts\n${policy}`)
  } else {
    const types = safeReadFile('src/domain/types.ts', 30)
    if (types) sections.push(`// src/domain/types.ts (first 30 lines)\n${types}`)
    const schema = safeReadFile('prisma/schema.prisma', 50)
    if (schema) sections.push(`// prisma/schema.prisma (first 50 lines)\n${schema}`)
  }

  const combined = sections.join('\n\n')
  return combined.slice(0, 4000)
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface ExecuteFile {
  path: string
  content: string
}

interface AgentResponse {
  summary: string
  files: ExecuteFile[]
  storyStatus: 'done' | 'in-progress'
  completionNotes?: string
}

export interface ExecuteStoryResult {
  storyId: string
  summary?: string
  filesWritten: string[]
  fileErrors?: string[]
  testResult: { passed: boolean; output: string }
  storyStatus: string
  completionNotes?: string
  error?: string
}

// ── Core execution logic ───────────────────────────────────────────────────────

export async function executeStory(projectId: string, storyId: string): Promise<ExecuteStoryResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { storyId, error: 'ANTHROPIC_API_KEY is not set', filesWritten: [], testResult: { passed: false, output: '' }, storyStatus: 'backlog' }
  }

  // 1. Load story with tasks, epic, workstream
  const story = await prisma.userStory.findUnique({ where: { id: storyId } })
  const [tasks, epicRec, featureRec, workstreamRec] = story ? await Promise.all([
    prisma.task.findMany({ where: { storyId }, orderBy: { sequence: 'asc' } }),
    story.epicId ? prisma.epic.findUnique({ where: { id: story.epicId }, select: { title: true } }) : null,
    story.featureId ? prisma.feature.findUnique({ where: { id: story.featureId }, select: { title: true } }) : null,
    story.workstreamId ? prisma.workstream.findUnique({ where: { id: story.workstreamId }, select: { name: true } }) : null,
  ]) : [[], null, null, null]
  const storyWithRelations = story ? { ...story, tasks, epic: epicRec, feature: featureRec, workstream: workstreamRec } : null

  if (!story) {
    return { storyId, error: 'story not found', filesWritten: [], testResult: { passed: false, output: '' }, storyStatus: 'backlog' }
  }
  if (story.projectId !== projectId) {
    return { storyId, error: 'story does not belong to this project', filesWritten: [], testResult: { passed: false, output: '' }, storyStatus: 'backlog' }
  }

  // 2. Mark as active
  await prisma.userStory.update({ where: { id: storyId }, data: { status: 'active' } })

  // 3. Build context from workstream
  const codebaseContext = loadContextForWorkstream(storyWithRelations?.workstream?.name ?? null)

  // 4. Build user prompt
  const taskList = tasks.map((t, i) => `  ${i + 1}. ${t.title}${t.description ? `: ${t.description}` : ''}`).join('\n')

  const userPrompt = `## Story to implement

**Title:** ${story.title}
**Epic:** ${epicRec?.title ?? 'none'}
**Feature:** ${featureRec?.title ?? 'none'}
**Workstream:** ${workstreamRec?.name ?? 'none'}
**Priority:** ${story.priority}

**User Story / Description:**
${story.userStory || '(no description)'}

**Acceptance Criteria (from notes):**
${story.notes || '(none provided)'}

**Tasks:**
${taskList || '  (no tasks defined)'}

---

## Relevant codebase context

${codebaseContext || '(no context loaded)'}

---

Implement this story. Output only valid JSON as specified.`

  // 5. Call Anthropic (streaming required for long requests)
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let raw = ''
  try {
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 32000,
      system: EXECUTION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })
    const message = await stream.finalMessage()
    raw = message.content.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('')
  } catch (e) {
    await prisma.userStory.update({ where: { id: storyId }, data: { status: 'backlog' } })
    return { storyId, error: `Anthropic API error: ${String(e).slice(0, 200)}`, filesWritten: [], testResult: { passed: false, output: '' }, storyStatus: 'backlog' }
  }

  // 6. Parse response
  let parsed: AgentResponse | null = null
  let parseError = ''
  try {
    const match = raw.match(/```json\s*([\s\S]*?)```|(\{[\s\S]*\})/)
    const jsonStr = match ? (match[1] ?? match[2]) : raw
    if (jsonStr) {
      parsed = JSON.parse(jsonStr) as AgentResponse
    } else {
      parseError = `no JSON found (first 300 chars: ${raw.slice(0, 300)})`
    }
  } catch (e) {
    parseError = `JSON parse failed: ${String(e).slice(0, 200)}`
  }

  if (!parsed) {
    await prisma.userStory.update({ where: { id: storyId }, data: { status: 'backlog' } })
    return { storyId, error: `agent response parse failed: ${parseError}`, filesWritten: [], testResult: { passed: false, output: '' }, storyStatus: 'backlog' }
  }

  // 7. Write files to disk
  const filesWritten: string[] = []
  const fileErrors: string[] = []

  for (const file of parsed.files ?? []) {
    if (!file.path || !file.content) continue
    try {
      const absPath = path.join(PROJECT_ROOT, file.path)
      fs.mkdirSync(path.dirname(absPath), { recursive: true })
      fs.writeFileSync(absPath, file.content, 'utf-8')
      filesWritten.push(file.path)
    } catch (e) {
      fileErrors.push(`${file.path}: ${String(e)}`)
    }
  }

  // 8. Run tests (silent, 30s timeout)
  let testResult: { passed: boolean; output: string } = { passed: true, output: 'no tests run' }
  if (filesWritten.length > 0) {
    try {
      const output = execSync('npm test -- --run 2>&1', {
        cwd: PROJECT_ROOT,
        timeout: 30000,
        encoding: 'utf-8',
      })
      testResult = { passed: true, output: output.slice(-1000) }
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string; message?: string }
      const out = ((err.stdout ?? '') + (err.stderr ?? '')) || (err.message ?? '')
      testResult = { passed: false, output: out.slice(-1000) }
    }
  }

  // 9. Update story status
  const finalStatus = parsed.storyStatus === 'done' && testResult.passed ? 'done' : 'active'
  await prisma.userStory.update({ where: { id: storyId }, data: { status: finalStatus } })

  return {
    storyId,
    summary: parsed.summary,
    filesWritten,
    fileErrors: fileErrors.length ? fileErrors : undefined,
    testResult,
    storyStatus: finalStatus,
    completionNotes: parsed.completionNotes,
  }
}
