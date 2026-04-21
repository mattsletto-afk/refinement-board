/**
 * Executes a single simulation job.
 * Extracted from the run route so it can be called from a background worker.
 */

import Anthropic from '@anthropic-ai/sdk'
import { queuedMessagesCreate } from '@/src/infrastructure/anthropic/rateLimitQueue'
import { prisma } from '@/src/infrastructure/db/client'
import { DEFAULT_RUN_TEMPLATE, resolveTemplate } from '@/src/domain/runTemplate'
import {
  saveSuggestion,
  getAppliedFingerprints, getSkippedFingerprints,
} from '@/src/infrastructure/db/suggestions'
import type { SuggestionAction, EntityType } from '@/src/infrastructure/db/suggestions'
import { fingerprintFromChange } from '@/src/domain/fingerprint'
import { snapshotProject } from '@/src/domain/snapshot'
import { buildDiffSummary } from '@/src/domain/diffEngine'
import { saveRunDiff } from '@/src/infrastructure/db/runDiffs'
import { validatePayload } from '@/src/domain/autoApply/validators'
import { detectConflicts, buildEntityIndex } from '@/src/domain/autoApply/conflicts'
import { writeAgentMemory, readAgentMemory } from '@/src/infrastructure/db/agentMemory'
import { buildMemoryContext, injectMemoryIntoPrompt } from '@/src/domain/agentMemoryPrompt'
import { appendAuditEvent } from '@/src/infrastructure/db/auditLog'
import { assertWithinBudget, recordTokenUsage } from '@/src/infrastructure/anthropic/costGuardrail'
import { classifyAction } from '@/src/domain/safety/classificationEngine'
import { processAutoApplyQueue } from '@/src/domain/autoApply/service'

const SIMULATION_SYSTEM_PROMPT = `You are an execution-oriented AI agent operating inside a project simulation system called Refinement Board.

Your role is to actively advance project planning — not suggest ideas for later review.

## 70% Rule
You are allowed to plan with 70% information.
Missing detail becomes assumptions and risks — never a reason to stop.

## Core behavior
Default to action. Make planning assumptions, record them, proceed.
Build usable structure. Refine it over time. Avoid repeating yourself.
Evolve previous work instead of restarting it.

## Suggestion lifecycle
All suggestions exist as persistent records with status:
  proposed → drafted → applied → superseded | duplicate | rejected

## Fingerprint rules
Every suggestion must include a fingerprint.
Format: <action>_<object>_<normalized_name>
Examples:
  create_epic_salesforce_knowledge_foundation
  create_feature_article_workflow
  create_risk_missing_taxonomy

Rules:
- same intent = same fingerprint, even if wording differs
- before creating, check existing fingerprints provided to you
- if fingerprint already exists with status=applied → DO NOT recreate
- if status=proposed/drafted → refine or advance it
- if status=duplicate → ignore
- if status=superseded → only recreate if meaningfully different

## Evolution rule
If something already exists: improve it, merge it, organize it, assign it.
Do not repeat it.

## Execution policy
Each run must:
1. Inspect current state (brief, existing items, existing suggestions)
2. Fill gaps with assumptions — log them
3. Act: create missing epics/features/stories/tasks/risks, reparent orphans, bundle sprint
4. Only escalate true blockers (cannot proceed at all)

## Maturity model
Early: create structure — epics, features, stories, risks
Mid: refine stories, add tasks, organize dependencies
Late: optimize sprint, prepare exports, finalize outputs

## App improvement rule
Suggest tool improvements only if they block project execution.
Label clearly as TOOL IMPROVEMENT, separate from PROJECT WORK.

## Output format (MANDATORY)

Output a single JSON object with this exact shape:

{
  "executiveSummary": "string",
  "assumptions": ["string"],
  "changes": [
    {
      "fingerprint": "create_epic_sf_knowledge_foundation",
      "action": "create-epic|create-feature|create-story|create-task|create-risk|create-milestone|reparent|update|comment",
      "confidence": "high|medium|low",
      "title": "string",
      "description": "string",
      "parentEpic": "exact title",
      "parentFeature": "exact title",
      "parentStory": "exact title (for tasks)",
      "workstream": "exact workstream name",
      "priority": "critical|high|medium|low",
      "storyPoints": 3,
      "acceptanceCriteria": "string"
    }
  ]
}`

interface SimChange {
  fingerprint?: string
  action?: string
  confidence?: string
  title?: string
  description?: string
  parentEpic?: string
  parentFeature?: string
  parentStory?: string
  workstream?: string
  priority?: string
  storyPoints?: number
  acceptanceCriteria?: string
  [key: string]: unknown
}

interface SimOutput {
  executiveSummary?: string
  assumptions?: string[]
  changes?: SimChange[]
}

export interface SimJobResult {
  runId: string
  executiveSummary?: string
  assumptions: string[]
  appliedCount: number
  skippedCount: number
  totalChanges: number
  autoApplied: number
  manualReview: number
  memoryRetrievalMs: number
}

export async function executeSimulationJob(simulationId: string): Promise<SimJobResult> {
  const simulation = await prisma.simulationSession.findUnique({ where: { id: simulationId } })
  if (!simulation) throw new Error(`Simulation ${simulationId} not found`)

  const agentId = `sim_${simulationId}`

  // ── Create AgentRun record (required FK for AgentSuggestion) ─────────────
  const agentRun = await prisma.agentRun.create({
    data: {
      projectId: simulation.projectId,
      sessionId: simulationId,
      agentType: 'project-planner',
      mode: 'recommend',
      status: 'running',
      startedAt: new Date(),
    },
  })
  const runId = agentRun.id

  // ── Audit: run triggered ─────────────────────────────────────────────────
  appendAuditEvent({ projectId: simulation.projectId, eventType: 'run.triggered', actorType: 'system', actorId: agentId, runId, sessionId: simulationId, details: { simulationId, agentType: 'project-planner' } }).catch(() => {})

  // ── Retrieve agent memory ─────────────────────────────────────────────────
  const memoryStart = Date.now()
  let memoryContext = ''
  try {
    const priorRuns = await readAgentMemory(agentId, 5)
    memoryContext = buildMemoryContext(priorRuns)
  } catch { /* non-fatal */ }
  const memoryMs = Date.now() - memoryStart

  // ── Build prompt ──────────────────────────────────────────────────────────
  const snapshot = await snapshotProject(simulation.projectId)
  const template = (simulation.runTemplate as string | null) ?? DEFAULT_RUN_TEMPLATE

  const appliedFpSet = await getAppliedFingerprints(simulation.projectId)
  const skippedFpSet = await getSkippedFingerprints(simulation.projectId)

  const baseUserPrompt = resolveTemplate(template, {
    brief: simulation.briefingText || 'No briefing provided.',
    workItems: JSON.stringify(snapshot, null, 2),
    suggestions: 'See applied/skipped fingerprints above.',
    sprintNumber: 1,
    tokenBudget: simulation.tokenBudget ?? 50000,
    agents: simulation.assignedAgents ?? '[]',
    appliedFingerprints: [...appliedFpSet].join(', ') || 'none',
    duplicateFingerprints: [...skippedFpSet].join(', ') || 'none',
  })
  const userPrompt = injectMemoryIntoPrompt(baseUserPrompt, memoryContext)

  // ── Budget check ─────────────────────────────────────────────────────────
  await assertWithinBudget({ projectId: simulation.projectId, hardLimitUsd: 10 })

  // ── Call Anthropic ────────────────────────────────────────────────────────
  const client = new Anthropic()
  let rawContent = ''
  const message = await queuedMessagesCreate(client, {
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: SIMULATION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })
  if (!message || !message.content) {
    throw new Error(`Anthropic returned no content. Stop reason: ${(message as { stop_reason?: string })?.stop_reason ?? 'unknown'}`)
  }
  if (message.usage) {
    const u = message.usage as { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
    recordTokenUsage(runId, {
      inputTokens:      u.input_tokens,
      outputTokens:     u.output_tokens,
      cacheReadTokens:  u.cache_read_input_tokens,
      cacheWriteTokens: u.cache_creation_input_tokens,
    }, 'claude-sonnet-4-6').catch(() => {})
  }
  rawContent = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  // ── Parse output ──────────────────────────────────────────────────────────
  let parsed: SimOutput = {}
  try {
    const m = rawContent.match(/\{[\s\S]*\}/)
    if (m) parsed = JSON.parse(m[0]) as SimOutput
  } catch { /* use empty */ }

  const changes: SimChange[] = parsed.changes ?? []

  // ── Process changes ───────────────────────────────────────────────────────
  const appliedFingerprints = await getAppliedFingerprints(simulation.projectId)
  const skippedFingerprints = await getSkippedFingerprints(simulation.projectId)
  const entityIndex = buildEntityIndex(
    snapshot.epics,
    snapshot.features,
    snapshot.stories,
    snapshot.risks,
    snapshot.milestones,
    appliedFingerprints,
  )
  const appliedChanges: SimChange[] = []
  const skippedChanges: SimChange[] = []

  for (const change of changes) {
    if (!change.fingerprint || !change.action) { skippedChanges.push(change); continue }

    const entityType = change.action.replace('create-', '') as EntityType
    // Normalize compound action strings (e.g. "create-story") to the SuggestionAction verb ("create")
    const actionVerb = (change.action.includes('-') ? change.action.split('-')[0] : change.action) as SuggestionAction
    const fp = fingerprintFromChange({ action: actionVerb, entityType, title: change.title, projectId: simulation.projectId })
    const hashed = fp.hash

    if (appliedFingerprints.has(hashed) || skippedFingerprints.has(hashed)) {
      skippedChanges.push(change)
      continue
    }

    const validationIssues = validatePayload(
      actionVerb,
      entityType,
      change as Record<string, unknown>,
      change.title ?? '',
    )
    if (validationIssues.length > 0) {
      skippedChanges.push(change)
      continue
    }

    const conflicts = detectConflicts({
      action: actionVerb,
      entityType,
      title: change.title ?? '',
      fingerprintHash: hashed,
      parentEpicTitle: change.parentEpic,
      parentFeatureTitle: change.parentFeature,
      parentStoryTitle: change.parentStory,
    }, entityIndex)
    if (conflicts.length > 0) {
      skippedChanges.push(change)
      continue
    }

    // Safety classification gate
    const safety = classifyAction({
      action: actionVerb,
      entityType,
      title: change.title ?? '',
      description: change.description,
      confidence: (change.confidence ?? 'medium') as 'high' | 'medium' | 'low',
    })
    if (safety.verdict === 'blocked') { skippedChanges.push(change); continue }

    // All changes from simulations are saved as suggestions (recommend mode)
    try {
      await saveSuggestion({ runId, action: actionVerb, entityType, title: change.title ?? '', description: change.description, payload: { ...change }, confidence: (change.confidence as string) ?? 'medium', sessionId: simulationId, projectId: simulation.projectId })
      appliedChanges.push(change)
      appendAuditEvent({ projectId: simulation.projectId, eventType: 'change.applied', actorType: 'agent', actorId: agentId, runId, sessionId: simulationId, entityType, entityTitle: change.title ?? '', details: { fingerprint: change.fingerprint, action: change.action, confidence: change.confidence } }).catch(() => {})
    } catch { skippedChanges.push(change) }
  }

  // ── Auto-apply pipeline: high+medium confidence → real entities ──────────
  let autoApplied = 0
  let manualReview = 0
  try {
    const applyResults = await processAutoApplyQueue(simulation.projectId)
    for (const r of applyResults) {
      if (r.decision === 'auto-apply') {
        autoApplied++
        appendAuditEvent({ projectId: simulation.projectId, eventType: 'change.applied', actorType: 'agent', actorId: agentId, runId, sessionId: simulationId, entityType: 'suggestion', entityTitle: r.suggestionId, details: { decision: 'auto-apply', entityId: r.entityId } }).catch(() => {})
      } else if (r.decision === 'manual-review') {
        manualReview++
      }
    }
  } catch { /* auto-apply is best-effort; suggestions remain as proposed if it fails */ }

  // ── Audit: run completed ────────────────────────────────────────────────
  appendAuditEvent({ projectId: simulation.projectId, eventType: 'run.completed', actorType: 'system', actorId: agentId, runId, sessionId: simulationId, details: { appliedCount: appliedChanges.length, skippedCount: skippedChanges.length, totalChanges: changes.length, autoApplied, manualReview } }).catch(() => {})

  // ── Diff + memory ────────────────────────────────────────────────────────
  const afterSnapshot = await snapshotProject(simulation.projectId)
  const diff = buildDiffSummary(snapshot, afterSnapshot, [])
  await saveRunDiff({ agentRunId: runId, projectId: simulation.projectId, beforeState: snapshot, afterState: afterSnapshot, diffSummary: diff }).catch(() => {})

  await writeAgentMemory({
    agentId,
    projectId: simulation.projectId,
    runId,
    content: JSON.stringify({
      summary:          parsed.executiveSummary ?? '',
      assumptions:      parsed.assumptions ?? [],
      appliedCount:     appliedChanges.length,
      skippedCount:     skippedChanges.length,
      actionsCount:     changes.length,
      autoApplied,
      manualReview,
      memoryRetrievalMs: memoryMs,
    }),
  }).catch(() => {})

  await prisma.agentRun.update({
    where: { id: runId },
    data: { status: 'complete', summary: parsed.executiveSummary ?? '', completedAt: new Date() },
  }).catch(() => {})

  return {
    runId,
    executiveSummary: parsed.executiveSummary,
    assumptions: parsed.assumptions ?? [],
    appliedCount: appliedChanges.length,
    skippedCount: skippedChanges.length,
    totalChanges: changes.length,
    autoApplied,
    manualReview,
    memoryRetrievalMs: memoryMs,
  }
}
