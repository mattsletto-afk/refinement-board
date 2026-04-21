/**
 * assumption-handler
 *
 * A constrained AI persona service (alias: Oracle) that detects missing inputs,
 * proposes safe synthetic placeholders, blocks unsafe assumptions, and returns
 * strict structured JSON for human review.
 *
 * This is NOT a chatbot. It is a narrow internal agent role used to keep
 * simulations and planning workflows moving when required inputs are missing.
 *
 * ── Quick start ──────────────────────────────────────────────────────────────
 *
 *   import { execute, createMockInvoker, FIXTURE_SIMULATION_REQUEST } from '@/src/assumption-handler'
 *
 *   // With a real model (Anthropic):
 *   import { createAnthropicInvoker } from '@/src/assumption-handler'
 *   const result = await execute(FIXTURE_SIMULATION_REQUEST, createAnthropicInvoker())
 *   console.log(result.patch)       // ProposedStatePatch — review before applying
 *   console.log(result.validation)  // ApplyValidationResult — auto-apply counts
 *
 *   // With a mock (testing/demo):
 *   const result = await execute(FIXTURE_SIMULATION_REQUEST, createMockInvoker())
 *
 * ── Design rules ─────────────────────────────────────────────────────────────
 *
 *   - Green fields  → propose + mark autoApplyEligible (in simulation/demo/testing only)
 *   - Yellow fields → propose + requiresReview = true
 *   - Red fields    → BLOCKED: pricing.*, budget.*, compliance.*, legal.*,
 *                              security.*, kpi.*, revenue.*
 *   - synthetic: true on EVERY model-generated value — never presented as real
 *   - Patches NEVER auto-mutate source data — always return ProposedStatePatch
 *   - Model invocation is injected — no external API calls from this module
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type {
  // New-spec types
  AppMode,
  ApplyValidationResult,
  AssumptionHandlerRequest,
  AssumptionHandlerResponse,
  AssumptionPolicyRule,
  AssumptionRecord,
  BlockedField,
  ConfidenceLevel,
  ModelInvoker,
  PatchItem,
  PolicyLevel,
  ProposedStatePatch,
  SyntheticRecord,
  UnknownField,
  UnknownSeverity,
  ValueSource,
  // Legacy types (preserved)
  Assumption,
  AssumptionBatch,
  AssumptionHandlerResult,
  AssumptionInput,
  AssumptionStatus,
  FieldClassification,
  FieldPolicy,
  HandlerContext,
  LegacyModelInvoker,
  ModelRequest,
  ModelResponse,
  PatchOutcome,
  PatchResult,
  PolicyEvaluation,
  PromptContext,
  SimulationMode,
  ValidationResult,
} from './types'

// ── New-spec service ──────────────────────────────────────────────────────────

export type { PrepareResult, HandleResult } from './service'
export { prepare, handleModelResponse, execute } from './service'

// ── New-spec policy ───────────────────────────────────────────────────────────

export {
  DEFAULT_RULES,
  matchPolicyRule,
  classifyField,
  isRedField,
  isGreenField,
  isYellowField,
  isAutoApplyEligible,
} from './policy'

// ── New-spec validators ───────────────────────────────────────────────────────

export { parseAssumptionResponse, validateAssumptionResponse } from './validators'

// ── New-spec patch ────────────────────────────────────────────────────────────

export { buildPatch } from './patch'

// ── New-spec prompts ──────────────────────────────────────────────────────────

export { buildSystemPrompt, buildDeveloperPrompt, buildUserPrompt } from './prompts'

// ── New-spec fixtures ─────────────────────────────────────────────────────────

export {
  FIXTURE_SIMULATION_REQUEST,
  FIXTURE_SIMULATION_RESPONSE,
  FIXTURE_BACKLOG_REQUEST,
  FIXTURE_BACKLOG_RESPONSE,
  FIXTURE_DEMO_REQUEST,
  FIXTURE_DEMO_RESPONSE,
  createMockInvoker,
  createFailingInvoker,
  createRedFieldInvoker,
  createAnthropicInvoker,
  createOpenAIInvoker,
} from './fixtures'

// ── Legacy exports (preserved) ────────────────────────────────────────────────

export { createAssumption, processAssumptions, handleAssumption } from './service'
export { evaluateAssumption, evaluateBatch, classifyFieldLegacy } from './policy'
export { applyPatch, applyPatches, rollbackPatch, getPatch, getPatchesByEntity, summarizePatches } from './patch'
export { validateAssumptionInput, validateAssumption, validatePatchPayload, parseEvaluationResponse } from './validators'
export { buildEvaluationPrompt, buildBatchSummaryPrompt, buildPatchJustificationPrompt, ASSUMPTION_SYSTEM_PROMPT } from './prompts'
export { createLegacyMockInvoker, createFixtureContext, FIXTURE_ASSUMPTIONS } from './fixtures'
