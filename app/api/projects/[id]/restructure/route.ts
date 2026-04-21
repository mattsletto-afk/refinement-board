import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/src/infrastructure/db/client'
import { queuedMessagesCreate } from '@/src/infrastructure/anthropic/rateLimitQueue'

type Ctx = { params: Promise<{ id: string }> }

const MODEL = 'claude-sonnet-4-6'

const SYSTEM = `You are a senior product manager and architect analyzing a product backlog.
Your job is to restructure a flat list of vague work items into a clean Epic → Feature → Story hierarchy.

Definitions:
- EPIC: A large strategic initiative or goal (weeks to months of work). Usually answers "what major outcome are we pursuing?"
- FEATURE: A specific capability or area within an epic (days to a couple weeks of work). Usually answers "what does this epic deliver?"
- STORY: A concrete, implementable work item a developer can pick up (hours to a few days). Follows "As a [user] I want [action] so that [benefit]".

Guidelines:
- Items with vague titles like "User Management", "Reporting", "Admin" are almost certainly Epics or Features
- Items that describe a specific interaction or outcome are Stories
- If an item is too vague to classify as a Story, flag it as vague and suggest 2-3 concrete stories that would belong under it
- Preserve the original story IDs exactly — they are database IDs and must be returned unchanged
- Refine titles only when the original is genuinely unclear — keep good titles as-is
- Return ONLY valid JSON, no markdown, no explanation`

function buildPrompt(projectName: string, stories: { id: string; title: string; userStory: string; notes: string; status: string }[], context?: string) {
  // Trim long text fields to keep the prompt compact and the output within token budget
  const items = stories.map(s => {
    const us = s.userStory?.slice(0, 120) || ''
    const notes = s.notes?.slice(0, 80) || ''
    return `ID:${s.id} | ${s.title}${us ? ` | ${us}` : ''}${notes ? ` | ${notes}` : ''}`
  }).join('\n')

  const contextBlock = context?.trim()
    ? `\nAdditional context and instructions from the product team:\n"""\n${context.trim()}\n"""\nApply these instructions when classifying and grouping.\n`
    : ''

  return `Project: ${projectName}
${contextBlock}
Classify and restructure these ${stories.length} work items into an Epic → Feature → Story hierarchy.
Each line: ID | Title | UserStory | Notes

${items}

Rules:
- Be CONCISE: descriptions max 10 words, vagueReason max 15 words, userStory max 20 words
- Only suggest stories for vague features (max 2 per feature)
- directStories array should usually be empty — put stories under features
- reasoning field: 5 words max

Return ONLY a raw JSON object (no markdown fences) with this structure:
{
  "epics": [{
    "tempId": "epic-0",
    "title": "string",
    "description": "string",
    "priority": "high|medium|low",
    "reasoning": "string",
    "fromStoryId": "id-or-null",
    "features": [{
      "tempId": "feature-0",
      "title": "string",
      "description": "string",
      "priority": "high|medium|low",
      "fromStoryId": "id-or-null",
      "vague": false,
      "vagueReason": "null-or-string",
      "stories": [{"tempId":"story-0","fromStoryId":"id","title":"string","userStory":"string","generated":false}],
      "suggestedStories": [{"tempId":"sug-0","fromStoryId":null,"title":"string","userStory":"string","generated":true}]
    }],
    "directStories": []
  }],
  "unclassified": [{"fromStoryId":"id","title":"string","reason":"string"}],
  "summary": {"epicsFound":0,"featuresFound":0,"storiesReclassified":0,"vagueFlagged":0,"newStoriesSuggested":0}
}`
}

export async function POST(req: Request, { params }: Ctx) {
  const { id: projectId } = await params
  const body = await req.json().catch(() => ({})) as { context?: string; storyIds?: string[] }
  const context = body.context?.trim() || undefined
  const storyIds = Array.isArray(body.storyIds) && body.storyIds.length > 0 ? body.storyIds : undefined

  const [project, stories] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } }),
    prisma.userStory.findMany({
      where: {
        projectId,
        status: { not: 'archived' },
        ...(storyIds ? { id: { in: storyIds } } : {}),
      },
      select: { id: true, title: true, userStory: true, notes: true, status: true },
      orderBy: { rank: 'asc' },
    }),
  ])

  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })
  if (stories.length === 0) return NextResponse.json({ error: 'no stories to analyze' }, { status: 400 })

  const client = new Anthropic()
  const startedAt = new Date()

  const run = await prisma.agentRun.create({
    data: { projectId, agentType: 'restructure', status: 'running', startedAt },
  })

  try {
    const response = await queuedMessagesCreate(client, {
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: 'user', content: buildPrompt(project.name, stories, context) }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    // Strip markdown code fences robustly
    let json = raw.trim()
    if (json.startsWith('```')) {
      json = json.replace(/^```[^\n]*\n/, '')   // remove opening fence line
      json = json.replace(/\n```[^\n]*$/, '')   // remove closing fence line
      json = json.trim()
    }
    // If still not valid JSON, try to extract the outermost { ... }
    if (!json.startsWith('{')) {
      const braceStart = json.indexOf('{')
      const braceEnd = json.lastIndexOf('}')
      if (braceStart !== -1 && braceEnd !== -1) json = json.slice(braceStart, braceEnd + 1)
    }

    let plan: unknown
    try {
      plan = JSON.parse(json)
    } catch (parseErr) {
      const snippet = raw.slice(-200) // last 200 chars often shows where truncation happened
      const truncated = response.stop_reason === 'max_tokens'
      const msg = truncated
        ? `Response was cut off (hit token limit). Try again — the board may need a second pass.`
        : `Claude returned text that couldn't be parsed as JSON. Raw end: ${snippet}`
      await prisma.agentRun.update({
        where: { id: run.id },
        data: { status: 'failed', completedAt: new Date(), summary: msg,
          metadata: JSON.stringify({ error: 'parse_failed', truncated, rawEnd: snippet, outputTokens: response.usage.output_tokens }) },
      })
      return NextResponse.json({ error: msg, truncated }, { status: 500 })
    }

    const usage = response.usage
    const costUsd = (usage.input_tokens * 3 + usage.output_tokens * 15) / 1_000_000

    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: 'complete',
        completedAt: new Date(),
        tokensUsed: usage.input_tokens + usage.output_tokens,
        summary: `Analyzed ${stories.length} stories`,
        metadata: JSON.stringify({ costUsd, model: MODEL, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens }),
      },
    })

    await prisma.agentSuggestion.create({
      data: {
        projectId,
        runId: run.id,
        type: 'restructure',
        entityType: 'board',
        summary: `Restructure ${stories.length} stories into hierarchy`,
        proposedChanges: JSON.stringify(plan),
        confidenceLevel: 'high',
        status: 'proposed',
        reviewStatus: 'unreviewed',
      },
    })

    return NextResponse.json({ runId: run.id, plan, storyCount: stories.length })
  } catch (err) {
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: 'failed', completedAt: new Date(), summary: String(err) } })
    throw err
  }
}
