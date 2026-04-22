import type {
  Assumption,
  AssumptionHandlerRequest,
  AssumptionHandlerResponse,
  PatchItem,
  PatchResult,
  PolicyEvaluation,
  ProposedStatePatch,
} from './types'
import { classifyField, isAutoApplyEligible } from './policy'

// ── New-spec patch builder ────────────────────────────────────────────────────

export function buildPatch(
  response: AssumptionHandlerResponse,
  request: AssumptionHandlerRequest,
): ProposedStatePatch {
  if (response.assumptions.length === 0) {
    return {
      requestId: request.requestId,
      requiresReview: true,
      autoApplyEligible: false,
      items: [],
      createdAt: new Date().toISOString(),
    }
  }

  const verified = request.existingVerifiedValues ?? {}
  let anyAutoApply = false

  const items: PatchItem[] = response.assumptions.map(assumption => {
    const field = request.fields.find(f => f.path === assumption.field)
    const level = classifyField(assumption.field)
    const eligible = field
      ? isAutoApplyEligible(field, assumption.confidence, request.appMode, [], verified)
      : false

    if (eligible) anyAutoApply = true

    return {
      field: assumption.field,
      currentValue: field?.currentValue ?? null,
      proposedValue: assumption.proposedValue,
      source: assumption.source,
      synthetic: assumption.synthetic,
      confidence: assumption.confidence,
      level,
      requiresReview: !eligible,
    }
  })

  return {
    requestId: request.requestId,
    requiresReview: true,
    autoApplyEligible: anyAutoApply,
    items,
    createdAt: new Date().toISOString(),
  }
}

// ── Legacy patch system (preserved) ──────────────────────────────────────────

export interface PatchRecord {
  assumptionId: string
  entityType: string
  entityId?: string
  field: string
  previousValue: unknown
  appliedValue: unknown
  appliedAt: string
}

const _store = new Map<string, PatchRecord>()

export function getPatchStore(): ReadonlyMap<string, PatchRecord> {
  return _store
}

export function clearPatchStore(): void {
  _store.clear()
}

export function applyPatch(
  evaluation: PolicyEvaluation,
  options: { dryRun?: boolean } = {},
): PatchResult {
  const { assumption, eligible, blockReasons } = evaluation

  if (!eligible) {
    return { assumptionId: assumption.id, outcome: 'blocked', error: blockReasons.join(', ') }
  }

  if (options.dryRun) {
    return { assumptionId: assumption.id, outcome: 'applied', appliedValue: assumption.proposedValue }
  }

  try {
    _store.set(assumption.id, {
      assumptionId: assumption.id,
      entityType: assumption.entityType,
      entityId: assumption.entityId,
      field: assumption.field,
      previousValue: assumption.currentValue,
      appliedValue: assumption.proposedValue,
      appliedAt: new Date().toISOString(),
    })
    return { assumptionId: assumption.id, outcome: 'applied', appliedValue: assumption.proposedValue }
  } catch (err) {
    return { assumptionId: assumption.id, outcome: 'failed', error: err instanceof Error ? err.message : String(err) }
  }
}

export function applyPatches(
  evaluations: PolicyEvaluation[],
  options: { dryRun?: boolean } = {},
): PatchResult[] {
  return evaluations.map(e => applyPatch(e, options))
}

export function rollbackPatch(assumptionId: string): boolean {
  return _store.delete(assumptionId)
}

export function getPatch(assumptionId: string): PatchRecord | undefined {
  return _store.get(assumptionId)
}

export function getPatchesByEntity(entityType: string, entityId: string): PatchRecord[] {
  return Array.from(_store.values()).filter(
    r => r.entityType === entityType && r.entityId === entityId,
  )
}

export function summarizePatches(results: PatchResult[]): {
  applied: number; blocked: number; skipped: number; failed: number
} {
  return results.reduce(
    (acc, r) => ({ ...acc, [r.outcome]: (acc[r.outcome as keyof typeof acc] ?? 0) + 1 }),
    { applied: 0, blocked: 0, skipped: 0, failed: 0 },
  )
}
