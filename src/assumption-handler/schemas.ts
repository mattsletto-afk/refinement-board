import { z } from 'zod'

// ── Shared enums ──────────────────────────────────────────────────────────────

export const FieldClassificationSchema = z.enum(['green', 'yellow', 'red'])
export const PolicyLevelSchema = FieldClassificationSchema // alias

export const AssumptionStatusSchema = z.enum(['unverified', 'verified', 'rejected', 'deferred'])
export const ConfidenceLevelSchema = z.enum(['high', 'medium', 'low'])
export const PatchOutcomeSchema = z.enum(['applied', 'skipped', 'blocked', 'failed'])
export const SimulationModeSchema = z.enum(['enabled', 'disabled'])

// ── New-spec enums ────────────────────────────────────────────────────────────

export const ValueSourceSchema = z.enum(['user-provided', 'system-inferred', 'synthetic', 'verified'])
export const UnknownSeveritySchema = z.enum(['critical', 'major', 'minor', 'cosmetic'])
export const AppModeSchema = z.enum(['simulation', 'demo', 'testing', 'production'])

// ── Existing schemas (preserved) ──────────────────────────────────────────────

export const FieldPolicySchema = z.object({
  pattern: z.string().min(1),
  classification: FieldClassificationSchema,
  autoApplicable: z.boolean(),
}).strict()

export const AssumptionSchema = z.object({
  id: z.string().uuid(),
  entityType: z.string().min(1),
  entityId: z.string().optional(),
  field: z.string().min(1),
  currentValue: z.unknown(),
  proposedValue: z.unknown(),
  rationale: z.string(),
  confidence: ConfidenceLevelSchema,
  status: AssumptionStatusSchema,
  verified: z.boolean(),
  classification: FieldClassificationSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict()

export const AssumptionInputSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().optional(),
  field: z.string().min(1),
  currentValue: z.unknown(),
  proposedValue: z.unknown(),
  rationale: z.string().min(1),
  confidence: ConfidenceLevelSchema,
}).strict()

export const PolicyEvaluationSchema = z.object({
  assumption: AssumptionSchema,
  classification: FieldClassificationSchema,
  eligible: z.boolean(),
  blockReasons: z.array(z.string()),
}).strict()

export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
}).strict()

export const PatchResultSchema = z.object({
  assumptionId: z.string().uuid(),
  outcome: PatchOutcomeSchema,
  appliedValue: z.unknown().optional(),
  error: z.string().optional(),
}).strict()

export const HandlerContextInputSchema = z.object({
  simulationMode: SimulationModeSchema,
  projectId: z.string().min(1),
  runId: z.string().optional(),
}).strict()

export const ModelRequestSchema = z.object({
  systemPrompt: z.string().min(1),
  userMessage: z.string().min(1),
  maxTokens: z.number().int().positive().optional(),
}).strict()

export const ModelResponseSchema = z.object({
  content: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
}).strict()

export const AssumptionHandlerResultSchema = z.object({
  processed: z.number().int().nonnegative(),
  autoApplied: z.number().int().nonnegative(),
  queued: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  patches: z.array(PatchResultSchema),
  evaluations: z.array(PolicyEvaluationSchema),
}).strict()

export const AssumptionBatchSchema = z.object({
  projectId: z.string().min(1),
  entityType: z.string().optional(),
  assumptions: z.array(AssumptionSchema),
}).strict()

// ── New-spec schemas ──────────────────────────────────────────────────────────

export const UnknownFieldSchema = z.object({
  path: z.string().min(1),
  severity: UnknownSeveritySchema,
  currentValue: z.unknown(),
  context: z.string().optional(),
}).strict()

export const AssumptionPolicyRuleSchema = z.object({
  pattern: z.string().min(1),
  level: PolicyLevelSchema,
  autoApplyEligible: z.boolean(),
  reason: z.string().min(1),
}).strict()

export const AssumptionRecordSchema = z.object({
  field: z.string().min(1),
  proposedValue: z.unknown(),
  confidence: ConfidenceLevelSchema,
  rationale: z.string().min(1),
  synthetic: z.literal(true),
  source: ValueSourceSchema,
}).strict()

export const SyntheticRecordSchema = z.object({
  field: z.string().min(1),
  value: z.unknown(),
  synthetic: z.literal(true),
  confidence: ConfidenceLevelSchema,
  label: z.string().min(1),
}).strict()

export const BlockedFieldSchema = z.object({
  field: z.string().min(1),
  reason: z.string().min(1),
  level: PolicyLevelSchema,
}).strict()

export const AssumptionHandlerRequestSchema = z.object({
  requestId: z.string().min(1),
  appMode: AppModeSchema,
  fields: z.array(UnknownFieldSchema).min(1),
  context: z.record(z.string(), z.unknown()),
  existingVerifiedValues: z.record(z.string(), z.unknown()).optional(),
  maxAssumptions: z.number().int().positive().optional(),
}).strict()

export const AssumptionHandlerResponseSchema = z.object({
  requestId: z.string().min(1),
  assumptions: z.array(AssumptionRecordSchema),
  blocked: z.array(BlockedFieldSchema),
  synthetic: z.array(SyntheticRecordSchema),
  warnings: z.array(z.string()),
}).strict()

export const PatchItemSchema = z.object({
  field: z.string().min(1),
  currentValue: z.unknown(),
  proposedValue: z.unknown(),
  source: ValueSourceSchema,
  synthetic: z.boolean(),
  confidence: ConfidenceLevelSchema,
  level: PolicyLevelSchema,
  requiresReview: z.boolean(),
}).strict()

export const ProposedStatePatchSchema = z.object({
  requestId: z.string().min(1),
  requiresReview: z.literal(true),
  autoApplyEligible: z.boolean(),
  items: z.array(PatchItemSchema),
  createdAt: z.string().datetime(),
}).strict()

export const ApplyValidationResultSchema = z.object({
  valid: z.boolean(),
  autoApplyCount: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
}).strict()
