import type {
  Assumption,
  AssumptionPolicyRule,
  ConfidenceLevel,
  AppMode,
  FieldClassification,
  FieldPolicy,
  PolicyEvaluation,
  PolicyLevel,
  UnknownField,
} from './types'

// ── Default policy rules (spec-mandated) ──────────────────────────────────────

export const DEFAULT_RULES: AssumptionPolicyRule[] = [
  // Green — safe synthetic placeholders; auto-apply eligible
  { pattern: 'task.title',        level: 'green', autoApplyEligible: true,  reason: 'Descriptive label — safe synthetic placeholder' },
  { pattern: 'task.description',  level: 'green', autoApplyEligible: true,  reason: 'Descriptive content — safe synthetic placeholder' },
  { pattern: 'task.rationale',    level: 'green', autoApplyEligible: true,  reason: 'Rationale text — safe synthetic placeholder' },
  { pattern: 'risk.description',  level: 'green', autoApplyEligible: true,  reason: 'Risk description — safe synthetic placeholder' },
  { pattern: 'milestone.title',   level: 'green', autoApplyEligible: true,  reason: 'Milestone label — safe synthetic placeholder' },
  { pattern: 'persona.name',      level: 'green', autoApplyEligible: true,  reason: 'Display name — safe synthetic placeholder' },

  // Yellow — propose only; human review required before apply
  { pattern: 'story.title',        level: 'yellow', autoApplyEligible: false, reason: 'Story title affects scope — requires human confirmation' },
  { pattern: 'story.description',  level: 'yellow', autoApplyEligible: false, reason: 'Story narrative — requires human confirmation' },
  { pattern: 'story.epicId',       level: 'yellow', autoApplyEligible: false, reason: 'Epic linkage affects hierarchy — requires human confirmation' },
  { pattern: 'story.effort',       level: 'yellow', autoApplyEligible: false, reason: 'Effort estimate affects planning — requires human confirmation' },
  { pattern: 'task.storyId',       level: 'yellow', autoApplyEligible: false, reason: 'Story linkage affects hierarchy — requires human confirmation' },
  { pattern: 'project.teamSize',   level: 'yellow', autoApplyEligible: false, reason: 'Operational estimate — requires human confirmation' },
  { pattern: 'project.timelineWeeks', level: 'yellow', autoApplyEligible: false, reason: 'Timeline commitment — requires human confirmation' },

  // Red — never propose; block always
  { pattern: 'story.priority',    level: 'red', autoApplyEligible: false, reason: 'Priority drives delivery order — must not be invented' },
  { pattern: 'epic.title',        level: 'red', autoApplyEligible: false, reason: 'Epic title anchors scope — must not be invented' },
  { pattern: 'task.assignee',     level: 'red', autoApplyEligible: false, reason: 'Assignee is a real person — must not be invented' },
  { pattern: 'milestone.dueDate', level: 'red', autoApplyEligible: false, reason: 'Due date is a commitment — must not be invented' },
  { pattern: 'pricing.*',         level: 'red', autoApplyEligible: false, reason: 'Pricing data must not be invented' },
  { pattern: 'budget.*',          level: 'red', autoApplyEligible: false, reason: 'Budget data must not be invented' },
  { pattern: 'compliance.*',      level: 'red', autoApplyEligible: false, reason: 'Compliance information must not be invented' },
  { pattern: 'legal.*',           level: 'red', autoApplyEligible: false, reason: 'Legal information must not be invented' },
  { pattern: 'security.*',        level: 'red', autoApplyEligible: false, reason: 'Security facts must not be invented' },
  { pattern: 'kpi.*',             level: 'red', autoApplyEligible: false, reason: 'KPI data must not be invented' },
  { pattern: 'revenue.*',         level: 'red', autoApplyEligible: false, reason: 'Revenue data must not be invented' },
]

// ── Glob matching ─────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[+?^${}()|[\]\\]/g, '\\$&')
}

function patternToRegex(pattern: string): RegExp {
  const parts = pattern.split('.').map(seg => {
    if (seg === '**') return '.+'
    if (seg === '*')  return '[^.]+'
    return escapeRegex(seg)
  })
  return new RegExp(`^${parts.join('\\.')}$`)
}

function patternSpecificity(pattern: string): number {
  return pattern.split('.').reduce((n, seg) => {
    if (seg === '**') return n
    if (seg === '*')  return n + 1
    return n + 2
  }, 0)
}

// ── New-spec public API ───────────────────────────────────────────────────────

export function matchPolicyRule(
  fieldPath: string,
  rules: AssumptionPolicyRule[] = DEFAULT_RULES,
): AssumptionPolicyRule | null {
  const matches = rules
    .filter(r => patternToRegex(r.pattern).test(fieldPath))
    .sort((a, b) => patternSpecificity(b.pattern) - patternSpecificity(a.pattern))
  return matches[0] ?? null
}

export function classifyField(
  fieldPath: string,
  customRules: AssumptionPolicyRule[] = [],
): PolicyLevel {
  const rule = matchPolicyRule(fieldPath, [...customRules, ...DEFAULT_RULES])
  return rule?.level ?? 'yellow'
}

export function isRedField(fieldPath: string, customRules?: AssumptionPolicyRule[]): boolean {
  return classifyField(fieldPath, customRules) === 'red'
}

export function isGreenField(fieldPath: string, customRules?: AssumptionPolicyRule[]): boolean {
  return classifyField(fieldPath, customRules) === 'green'
}

export function isYellowField(fieldPath: string, customRules?: AssumptionPolicyRule[]): boolean {
  return classifyField(fieldPath, customRules) === 'yellow'
}

export function isAutoApplyEligible(
  field: UnknownField,
  confidence: ConfidenceLevel,
  appMode: AppMode,
  customRules: AssumptionPolicyRule[] = [],
  existingVerifiedValues: Record<string, unknown> = {},
): boolean {
  if (!['simulation', 'demo', 'testing'].includes(appMode)) return false

  const rule = matchPolicyRule(field.path, [...customRules, ...DEFAULT_RULES])
  if (!rule || rule.level !== 'green' || !rule.autoApplyEligible) return false
  if (confidence === 'low') return false

  const isEmpty = (v: unknown) =>
    v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
  if (!isEmpty(field.currentValue)) return false
  if (field.path in existingVerifiedValues) return false

  return true
}

// ── Legacy API (backward compat) ──────────────────────────────────────────────

/** @deprecated Use matchPolicyRule with AssumptionPolicyRule[] */
function legacyMatchesPattern(pattern: string, field: string): boolean {
  return patternToRegex(pattern).test(field)
}

/** @deprecated Use classifyField */
export function classifyFieldLegacy(
  entityType: string,
  field: string,
  customPolicies: FieldPolicy[] = [],
): { classification: FieldClassification; policy: FieldPolicy | null } {
  const qualifiedField = `${entityType}.${field}`
  const asPolicyRules: AssumptionPolicyRule[] = customPolicies.map(p => ({
    pattern: p.pattern,
    level: p.classification,
    autoApplyEligible: p.autoApplicable,
    reason: '',
  }))

  const allRules = [...asPolicyRules, ...DEFAULT_RULES]
  const matches = allRules
    .filter(r => patternToRegex(r.pattern).test(qualifiedField) || patternToRegex(r.pattern).test(field))
    .sort((a, b) => patternSpecificity(b.pattern) - patternSpecificity(a.pattern))

  if (matches.length === 0) return { classification: 'yellow', policy: null }

  const matched = matches[0]
  const legacyPolicy: FieldPolicy | null = customPolicies.find(p =>
    legacyMatchesPattern(p.pattern, qualifiedField) || legacyMatchesPattern(p.pattern, field)
  ) ?? null

  return { classification: matched.level, policy: legacyPolicy }
}

export function evaluateAssumption(
  assumption: Assumption,
  options: { simulationMode: 'enabled' | 'disabled'; customPolicies?: FieldPolicy[] },
): PolicyEvaluation {
  const { simulationMode, customPolicies = [] } = options
  const { classification } = classifyFieldLegacy(assumption.entityType, assumption.field, customPolicies)
  const blockReasons: string[] = []

  const isValueEmpty = (v: unknown) =>
    v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)

  if (classification === 'red')    blockReasons.push('field-classified-red')
  if (classification === 'yellow') blockReasons.push('field-classified-yellow')

  const rule = matchPolicyRule(`${assumption.entityType}.${assumption.field}`)
  if (classification === 'green' && rule && !rule.autoApplyEligible) {
    blockReasons.push('policy-not-auto-applicable')
  }

  if (assumption.confidence === 'low')          blockReasons.push('confidence-too-low')
  if (!isValueEmpty(assumption.currentValue))   blockReasons.push('current-value-not-empty')
  if (assumption.verified)                       blockReasons.push('already-verified')
  if (assumption.status === 'verified' || assumption.status === 'rejected') blockReasons.push('already-resolved')
  if (simulationMode !== 'enabled')              blockReasons.push('simulation-mode-disabled')

  return {
    assumption: { ...assumption, classification },
    classification,
    eligible: blockReasons.length === 0,
    blockReasons,
  }
}

export function evaluateBatch(
  assumptions: Assumption[],
  options: { simulationMode: 'enabled' | 'disabled'; customPolicies?: FieldPolicy[] },
): PolicyEvaluation[] {
  return assumptions.map(a => evaluateAssumption(a, options))
}
