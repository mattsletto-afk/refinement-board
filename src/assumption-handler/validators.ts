import { z } from 'zod'
import { AssumptionHandlerResponseSchema, AssumptionInputSchema, AssumptionSchema } from './schemas'
import type {
  Assumption,
  AssumptionHandlerRequest,
  AssumptionHandlerResponse,
  AssumptionInput,
  ApplyValidationResult,
  ValidationResult,
} from './types'
import { isAutoApplyEligible, isRedField } from './policy'

// ── New-spec validators ───────────────────────────────────────────────────────

export function parseAssumptionResponse(raw: string):
  | { success: true; data: AssumptionHandlerResponse }
  | { success: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { success: false, error: 'response is not valid JSON' }
  }

  const result = AssumptionHandlerResponseSchema.safeParse(parsed)
  if (!result.success) {
    const msg = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    return { success: false, error: `schema validation failed: ${msg}` }
  }
  return { success: true, data: result.data }
}

export function validateAssumptionResponse(
  response: AssumptionHandlerResponse,
  request: AssumptionHandlerRequest,
): ApplyValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // requestId match
  if (response.requestId !== request.requestId) {
    errors.push(`requestId mismatch: expected "${request.requestId}", got "${response.requestId}"`)
  }

  // no red-field assumptions
  for (const assumption of response.assumptions) {
    if (isRedField(assumption.field)) {
      errors.push(`red-field assumption rejected: "${assumption.field}" must not be proposed`)
    }
  }

  // all synthetic flags must be literal true
  for (const assumption of response.assumptions) {
    if (assumption.synthetic !== true) {
      errors.push(`assumption "${assumption.field}" missing synthetic:true flag`)
    }
  }
  for (const synth of response.synthetic) {
    if (synth.synthetic !== true) {
      errors.push(`synthetic record "${synth.field}" missing synthetic:true flag`)
    }
  }

  // no overwrite of verified values
  const verified = request.existingVerifiedValues ?? {}
  for (const assumption of response.assumptions) {
    if (assumption.field in verified) {
      errors.push(`"${assumption.field}" is already verified — assumption rejected`)
    }
  }

  // maxAssumptions limit
  if (request.maxAssumptions !== undefined && response.assumptions.length > request.maxAssumptions) {
    errors.push(
      `response contains ${response.assumptions.length} assumptions, exceeds limit of ${request.maxAssumptions}`,
    )
  }

  // count auto-apply eligible
  const autoApplyCount = response.assumptions.filter(a => {
    const field = request.fields.find(f => f.path === a.field)
    if (!field) return false
    return isAutoApplyEligible(field, a.confidence, request.appMode, [], verified)
  }).length

  if (response.warnings.length > 0) warnings.push(...response.warnings)

  return {
    valid: errors.length === 0,
    autoApplyCount,
    blockedCount: response.blocked.length,
    errors,
    warnings,
  }
}

// ── Legacy validators (preserved) ────────────────────────────────────────────

export function validateAssumptionInput(input: unknown): ValidationResult {
  const result = AssumptionInputSchema.safeParse(input)
  if (result.success) return { valid: true, errors: [], warnings: [] }
  const errors = result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`)
  return { valid: false, errors, warnings: [] }
}

export function validateAssumption(assumption: unknown): ValidationResult {
  const result = AssumptionSchema.safeParse(assumption)
  if (!result.success) {
    const errors = result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`)
    return { valid: false, errors, warnings: [] }
  }

  const warnings: string[] = []
  const a = result.data as Assumption

  if (!a.rationale || a.rationale.trim().length < 10) {
    warnings.push('rationale is very short — consider adding more context')
  }
  if (a.proposedValue === a.currentValue) {
    warnings.push('proposedValue is identical to currentValue — this assumption has no effect')
  }

  return { valid: true, errors: [], warnings }
}

const REQUIRED_NON_EMPTY: Record<string, string[]> = {
  task:      ['title'],
  story:     ['title'],
  epic:      ['title'],
  feature:   ['title'],
  risk:      ['title', 'description'],
  milestone: ['title'],
}

export function validatePatchPayload(
  entityType: string,
  field: string,
  proposedValue: unknown,
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const requiredFields = REQUIRED_NON_EMPTY[entityType] ?? []
  if (requiredFields.includes(field)) {
    if (proposedValue === null || proposedValue === undefined || proposedValue === '') {
      errors.push(`${entityType}.${field} cannot be set to an empty value`)
    }
  }

  if (typeof proposedValue === 'string' && proposedValue.length > 2000) {
    warnings.push(`${field} value is very long (${proposedValue.length} chars) — verify this is intentional`)
  }

  return { valid: errors.length === 0, errors, warnings }
}

const EvaluationResponseSchema = z.object({
  reasonable: z.boolean(),
  improves: z.boolean(),
  risks: z.array(z.string()),
  suggestedConfidence: z.enum(['high', 'medium', 'low']),
  notes: z.string(),
}).strict()

const PatchJustificationResponseSchema = z.object({
  safe: z.boolean(),
  concern: z.string().nullable(),
}).strict()

export function parseEvaluationResponse(raw: string): {
  valid: boolean
  data?: z.infer<typeof EvaluationResponseSchema>
  error?: string
} {
  try {
    const parsed = JSON.parse(raw)
    const result = EvaluationResponseSchema.safeParse(parsed)
    if (result.success) return { valid: true, data: result.data }
    return { valid: false, error: result.error.issues.map(i => i.message).join('; ') }
  } catch {
    return { valid: false, error: 'failed to parse JSON response from model' }
  }
}

export function parsePatchJustificationResponse(raw: string): { safe: boolean; concern: string | null } {
  try {
    const parsed = JSON.parse(raw)
    const result = PatchJustificationResponseSchema.safeParse(parsed)
    if (result.success) return result.data
  } catch { /* fall through */ }
  return { safe: false, concern: 'could not parse model response' }
}

export function validateBatch(inputs: unknown[]): { valid: boolean; results: ValidationResult[] } {
  const results = inputs.map(validateAssumptionInput)
  return { valid: results.every(r => r.valid), results }
}
