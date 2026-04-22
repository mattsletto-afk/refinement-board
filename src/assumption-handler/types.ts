// ── Existing types (preserved) ────────────────────────────────────────────────

export type AssumptionStatus = 'unverified' | 'verified' | 'rejected' | 'deferred'

export type ConfidenceLevel = 'high' | 'medium' | 'low'

export type PatchOutcome = 'applied' | 'skipped' | 'blocked' | 'failed'

export type SimulationMode = 'enabled' | 'disabled'

/** @deprecated Use AssumptionPolicyRule instead */
export interface FieldPolicy {
  pattern: string
  classification: FieldClassification
  autoApplicable: boolean
}

export interface Assumption {
  id: string
  entityType: string
  entityId?: string
  field: string
  currentValue: unknown
  proposedValue: unknown
  rationale: string
  confidence: ConfidenceLevel
  status: AssumptionStatus
  verified: boolean
  classification?: FieldClassification
  createdAt: string
  updatedAt: string
}

export interface AssumptionInput {
  entityType: string
  entityId?: string
  field: string
  currentValue: unknown
  proposedValue: unknown
  rationale: string
  confidence: ConfidenceLevel
}

export interface PolicyEvaluation {
  assumption: Assumption
  classification: FieldClassification
  eligible: boolean
  blockReasons: string[]
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface PatchResult {
  assumptionId: string
  outcome: PatchOutcome
  appliedValue?: unknown
  error?: string
}

export interface ModelRequest {
  systemPrompt: string
  userMessage: string
  maxTokens?: number
}

export interface ModelResponse {
  content: string
  inputTokens: number
  outputTokens: number
}

export interface AssumptionHandlerResult {
  processed: number
  autoApplied: number
  queued: number
  skipped: number
  patches: PatchResult[]
  evaluations: PolicyEvaluation[]
}

export interface AssumptionBatch {
  projectId: string
  entityType?: string
  assumptions: Assumption[]
}

export interface PromptContext {
  projectId: string
  entityType: string
  field: string
  currentValue: unknown
  proposedValue: unknown
  rationale: string
  existingAssumptions?: Assumption[]
}

// ── New spec types ────────────────────────────────────────────────────────────

export type ValueSource = 'user-provided' | 'system-inferred' | 'synthetic' | 'verified'

export type UnknownSeverity = 'critical' | 'major' | 'minor' | 'cosmetic'

/** Primary policy classification — replaces FieldClassification */
export type PolicyLevel = 'green' | 'yellow' | 'red'

/** Alias kept for backward compatibility */
export type FieldClassification = PolicyLevel

export type AppMode = 'simulation' | 'demo' | 'testing' | 'production'

export interface UnknownField {
  path: string
  severity: UnknownSeverity
  currentValue: unknown
  context?: string
}

export interface AssumptionPolicyRule {
  pattern: string
  level: PolicyLevel
  autoApplyEligible: boolean
  reason: string
}

export interface AssumptionRecord {
  field: string
  proposedValue: unknown
  confidence: ConfidenceLevel
  rationale: string
  synthetic: true
  source: ValueSource
}

export interface SyntheticRecord {
  field: string
  value: unknown
  synthetic: true
  confidence: ConfidenceLevel
  label: string
}

export interface BlockedField {
  field: string
  reason: string
  level: PolicyLevel
}

export interface AssumptionHandlerRequest {
  requestId: string
  appMode: AppMode
  fields: UnknownField[]
  context: Record<string, unknown>
  existingVerifiedValues?: Record<string, unknown>
  maxAssumptions?: number
}

export interface AssumptionHandlerResponse {
  requestId: string
  assumptions: AssumptionRecord[]
  blocked: BlockedField[]
  synthetic: SyntheticRecord[]
  warnings: string[]
}

export interface PatchItem {
  field: string
  currentValue: unknown
  proposedValue: unknown
  source: ValueSource
  synthetic: boolean
  confidence: ConfidenceLevel
  level: PolicyLevel
  requiresReview: boolean
}

export interface ProposedStatePatch {
  requestId: string
  requiresReview: true
  autoApplyEligible: boolean
  items: PatchItem[]
  createdAt: string
}

export interface ApplyValidationResult {
  valid: boolean
  autoApplyCount: number
  blockedCount: number
  errors: string[]
  warnings: string[]
}

/** New-spec model invoker: takes structured prompts, returns raw string */
export type ModelInvoker = (prompts: {
  system: string
  developer: string
  user: string
}) => Promise<string>

/** Legacy model invoker kept for processAssumptions / enrichWithModel */
export type LegacyModelInvoker = (request: ModelRequest) => Promise<ModelResponse>

export interface HandlerContext {
  simulationMode: SimulationMode
  projectId: string
  runId?: string
  invokeModel: LegacyModelInvoker
}
