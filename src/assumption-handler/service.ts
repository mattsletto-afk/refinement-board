import { randomUUID } from 'crypto'
import type {
  Assumption,
  AssumptionBatch,
  AssumptionHandlerRequest,
  AssumptionHandlerResponse,
  AssumptionHandlerResult,
  AssumptionInput,
  ApplyValidationResult,
  FieldPolicy,
  HandlerContext,
  ModelInvoker,
  PolicyEvaluation,
  ProposedStatePatch,
} from './types'
import { evaluateBatch } from './policy'
import { applyPatches, buildPatch } from './patch'
import {
  parseAssumptionResponse,
  parseEvaluationResponse,
  validateAssumptionInput,
  validateAssumptionResponse,
  validatePatchPayload,
} from './validators'
import { buildSystemPrompt, buildDeveloperPrompt, buildUserPrompt, ASSUMPTION_SYSTEM_PROMPT, buildEvaluationPrompt } from './prompts'
import { AssumptionHandlerRequestSchema } from './schemas'

// ── New-spec service ──────────────────────────────────────────────────────────

export interface PrepareResult {
  system: string
  developer: string
  user: string
}

export interface HandleResult {
  response: AssumptionHandlerResponse
  patch: ProposedStatePatch
  validation: ApplyValidationResult
}

export function prepare(request: AssumptionHandlerRequest): PrepareResult {
  const parsed = AssumptionHandlerRequestSchema.safeParse(request)
  if (!parsed.success) {
    throw new Error(`invalid request: ${parsed.error.issues.map(i => i.message).join('; ')}`)
  }
  return {
    system: buildSystemPrompt(),
    developer: buildDeveloperPrompt(request),
    user: buildUserPrompt(request),
  }
}

export function handleModelResponse(
  request: AssumptionHandlerRequest,
  rawOutput: string,
): HandleResult {
  const parsed = parseAssumptionResponse(rawOutput)
  if (!parsed.success) {
    throw new Error(`model response parse failed: ${parsed.error}`)
  }

  const validation = validateAssumptionResponse(parsed.data, request)
  if (!validation.valid) {
    throw new Error(`model response validation failed: ${validation.errors.join('; ')}`)
  }

  const patch = buildPatch(parsed.data, request)
  return { response: parsed.data, patch, validation }
}

export async function execute(
  request: AssumptionHandlerRequest,
  invokeModel: ModelInvoker,
): Promise<HandleResult> {
  const prompts = prepare(request)
  const rawOutput = await invokeModel(prompts)
  return handleModelResponse(request, rawOutput)
}

// ── Legacy service (preserved) ────────────────────────────────────────────────

export function createAssumption(input: AssumptionInput): Assumption {
  const now = new Date().toISOString()
  return {
    id: randomUUID(),
    entityType: input.entityType,
    entityId: input.entityId,
    field: input.field,
    currentValue: input.currentValue,
    proposedValue: input.proposedValue,
    rationale: input.rationale,
    confidence: input.confidence,
    status: 'unverified',
    verified: false,
    createdAt: now,
    updatedAt: now,
  }
}

async function enrichWithModel(
  assumption: Assumption,
  ctx: HandlerContext,
  existingAssumptions: Assumption[] = [],
): Promise<Assumption> {
  try {
    const response = await ctx.invokeModel({
      systemPrompt: ASSUMPTION_SYSTEM_PROMPT,
      userMessage: buildEvaluationPrompt({
        projectId: ctx.projectId,
        entityType: assumption.entityType,
        field: assumption.field,
        currentValue: assumption.currentValue,
        proposedValue: assumption.proposedValue,
        rationale: assumption.rationale,
        existingAssumptions,
      }),
      maxTokens: 512,
    })
    const parsed = parseEvaluationResponse(response.content)
    if (parsed.valid && parsed.data) {
      return { ...assumption, confidence: parsed.data.suggestedConfidence, updatedAt: new Date().toISOString() }
    }
  } catch { /* enrichment is best-effort */ }
  return assumption
}

export async function processAssumptions(
  batch: AssumptionBatch,
  ctx: HandlerContext,
  options: {
    dryRun?: boolean
    skipModelEnrichment?: boolean
    customPolicies?: FieldPolicy[]
  } = {},
): Promise<AssumptionHandlerResult> {
  const { dryRun = false, skipModelEnrichment = false, customPolicies = [] } = options

  const validAssumptions: Assumption[] = []
  for (const assumption of batch.assumptions) {
    const validation = validateAssumptionInput({
      entityType: assumption.entityType,
      entityId: assumption.entityId,
      field: assumption.field,
      currentValue: assumption.currentValue,
      proposedValue: assumption.proposedValue,
      rationale: assumption.rationale,
      confidence: assumption.confidence,
    })
    if (validation.valid) validAssumptions.push(assumption)
  }

  const enriched = skipModelEnrichment
    ? validAssumptions
    : await Promise.all(validAssumptions.map(a => enrichWithModel(a, ctx, validAssumptions)))

  const patchValidated = enriched.filter(a => {
    const result = validatePatchPayload(a.entityType, a.field, a.proposedValue)
    return result.valid
  })

  const evaluations: PolicyEvaluation[] = evaluateBatch(patchValidated, {
    simulationMode: ctx.simulationMode,
    customPolicies,
  })

  const eligibleEvals = evaluations.filter(e => e.eligible)
  const blockedEvals  = evaluations.filter(e => !e.eligible)
  const patches = applyPatches(eligibleEvals, { dryRun })

  const applied = patches.filter(p => p.outcome === 'applied').length
  const failed  = patches.filter(p => p.outcome === 'failed').length

  return {
    processed: validAssumptions.length,
    autoApplied: applied,
    queued: blockedEvals.length + failed,
    skipped: batch.assumptions.length - validAssumptions.length,
    patches,
    evaluations,
  }
}

export async function handleAssumption(
  input: AssumptionInput,
  ctx: HandlerContext,
  options: {
    dryRun?: boolean
    skipModelEnrichment?: boolean
    customPolicies?: FieldPolicy[]
  } = {},
): Promise<{ assumption: Assumption; result: AssumptionHandlerResult }> {
  const assumption = createAssumption(input)
  const result = await processAssumptions(
    { projectId: ctx.projectId, entityType: assumption.entityType, assumptions: [assumption] },
    ctx,
    options,
  )
  return { assumption, result }
}
