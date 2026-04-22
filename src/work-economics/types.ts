// ── Effort point model ────────────────────────────────────────────────────────
// 1 EP ≈ 2 focused hours of uninterrupted work
// 20 EP = nominal full-time week (40h / 2h per EP)
// All costs, capacities, and estimates are expressed in EP

export type EffortPoints = number

// ── Work categories ───────────────────────────────────────────────────────────

export type WorkCategory =
  | 'delivery'      // Feature/story implementation
  | 'coordination'  // Sync, alignment, planning sessions
  | 'reporting'     // Status updates, decks, artifact maintenance
  | 'review'        // Reviewing or approving others' work
  | 'rework'        // Fixing or redoing completed work
  | 'unplanned'     // Ad-hoc requests, incidents, scope creep
  | 'blocked'       // Lost capacity from dependencies or waiting

// ── Progress states ───────────────────────────────────────────────────────────
// Work never advances automatically — effort must be explicitly applied.

export type ProgressState =
  | 'not-started'   // 0 EP consumed
  | 'started'       // 1–19 % of planned effort consumed
  | 'in-progress'   // 20–49 %
  | 'substantial'   // 50–79 %
  | 'review-ready'  // 80–99 %: work done, awaiting review action
  | 'accepted'      // Reviewed and approved — requires explicit reviewer EP
  | 'done'          // Accepted and closed

// ── Agent roles ───────────────────────────────────────────────────────────────

export type AgentRole =
  | 'delivery'      // Builds things; high delivery fraction
  | 'coordinator'   // Plans/aligns; moderate overhead load
  | 'reviewer'      // Reviews and approves; high review overhead
  | 'executive'     // Governance focus; low hands-on delivery

// ── Capacity ──────────────────────────────────────────────────────────────────

export interface AgentCapacityProfile {
  agentId: string
  role: AgentRole
  /** Total EP before any deductions (20 = full-time) */
  nominalWeeklyEP: EffortPoints
  /** Max fraction of nominal that can go to delivery work */
  maxDeliveryFraction: number
}

export interface WeeklyCapacityUsage {
  agentId: string
  week: number
  nominal: EffortPoints
  meetingCost: EffortPoints
  governanceCost: EffortPoints
  blockerDrag: EffortPoints
  switchingPenalty: EffortPoints
  unplannedWork: EffortPoints
  reworkCost: EffortPoints
  /** Remaining EP available for planned delivery (after all deductions) */
  effective: EffortPoints
  /** EP actually applied to delivery tasks this week */
  deliveryEP: EffortPoints
  /** deliveryEP / nominal */
  utilisation: number
  breakdown: Record<WorkCategory, EffortPoints>
}

// ── Meetings ──────────────────────────────────────────────────────────────────

export type MeetingType =
  | 'daily-standup'
  | 'weekly-review'
  | 'blocker-workshop'
  | 'executive-checkpoint'
  | 'sprint-planning'
  | 'retrospective'
  | 'ad-hoc-sync'

export interface MeetingCost {
  type: MeetingType
  /** EP per single occurrence (direct time in the room) */
  directEP: EffortPoints
  /** EP per occurrence for prep + follow-up + context-switch recovery */
  indirectEP: EffortPoints
  /** directEP + indirectEP */
  totalEP: EffortPoints
  /** Roles that pay this cost (others pay a reduced observer cost) */
  fullCostRoles: AgentRole[]
  /** Fraction of totalEP paid by non-full-cost attendees */
  observerFraction: number
  /** Default occurrences per week when scheduled normally */
  defaultFrequencyPerWeek: number
}

// ── Blockers ──────────────────────────────────────────────────────────────────

export type BlockerSeverity = 'soft' | 'hard' | 'systemic'

export interface BlockerDefinition {
  severity: BlockerSeverity
  /** Fraction of task's remaining capacity that is blocked (0–1) */
  capacityBlockFraction: number
  /** Additional coordination EP charged per blocked week (per affected agent) */
  coordinationOverheadEP: EffortPoints
  /** Expected resolution time in simulation days */
  typicalResolutionDays: number
  /** Whether this blocker spreads to agents depending on the blocked task */
  contagious: boolean
}

export interface ActiveBlocker {
  id: string
  taskId: string
  severity: BlockerSeverity
  startWeek: number
  resolvedWeek: number | null
  description: string
  affectedAgentIds: string[]
}

// ── Rework ────────────────────────────────────────────────────────────────────

export type ReworkSeverity = 1 | 2 | 3 | 4

export interface ReworkDefinition {
  severity: ReworkSeverity
  label: string
  /** EP cost = original task effort × this multiplier */
  effortMultiplier: number
  /** Progress regression: how far back the task state rolls */
  progressRegression: number
  invalidatesDownstream: boolean
  invalidatesArtifacts: boolean
  /** Whether this event forces a delivery forecast recalculation */
  shiftsForecasts: boolean
  causes: string[]
}

export interface ReworkEvent {
  id: string
  taskId: string
  severity: ReworkSeverity
  week: number
  originalEffortEP: EffortPoints
  reworkEffortEP: EffortPoints
  description: string
  triggeredBy: string
  downstreamTaskIds: string[]
}

// ── Context switching ─────────────────────────────────────────────────────────

export interface SwitchingProfile {
  /** Active parallel streams the agent is working across this week */
  activeStreams: number
  /** EP deducted from weekly effective capacity */
  penaltyEP: EffortPoints
  label: string
}

// ── Tasks and artifacts ───────────────────────────────────────────────────────

export interface TaskEconomics {
  taskId: string
  title: string
  ownerAgentId: string
  plannedEP: EffortPoints
  actualEP: EffortPoints
  state: ProgressState
  progressPct: number
  reworkEvents: ReworkEvent[]
  blockerIds: string[]
  stateEnteredWeek: number
  /** Downstream tasks that would be invalidated by rework on this task */
  downstreamTaskIds: string[]
}

export interface ArtifactEconomics {
  artifactId: string
  artifactClass: string
  ownerAgentId: string
  creationEP: EffortPoints
  maintenanceEP: EffortPoints
  reviewEP: EffortPoints
  state: ProgressState
  valid: boolean
  lastUpdatedWeek: number
}

// ── Variance tracking ─────────────────────────────────────────────────────────

export interface EffortVarianceRecord {
  taskId: string
  week: number
  plannedEP: EffortPoints
  actualEP: EffortPoints
  /** Positive = ahead of plan; negative = behind */
  weeklyVariance: EffortPoints
  cumulativeVariance: EffortPoints
  forecastCompletionWeek: number | null
}

// ── Throughput ────────────────────────────────────────────────────────────────

export interface ThroughputSummary {
  period: 'week' | 'month' | 'quarter'
  periodNumber: number
  nominalEP: EffortPoints
  plannedDeliveryEP: EffortPoints
  actualDeliveryEP: EffortPoints
  overheadEP: EffortPoints
  reworkEP: EffortPoints
  blockedEP: EffortPoints
  tasksCompleted: number
  tasksInFlight: number
  /** actualDeliveryEP / nominalEP */
  efficiency: number
}

// ── Forecast ──────────────────────────────────────────────────────────────────

export type ForecastConfidence = 'on-track' | 'at-risk' | 'off-track'

export interface ForecastRecord {
  week: number
  originalTargetWeek: number
  currentForecastWeek: number
  /** Weeks slipped from original target */
  slippage: number
  confidence: ForecastConfidence
  reasons: string[]
}

// ── Simulation week ───────────────────────────────────────────────────────────

export interface SimulationWeek {
  week: number
  agentUsage: WeeklyCapacityUsage[]
  taskStates: TaskEconomics[]
  artifactStates: ArtifactEconomics[]
  reworkEvents: ReworkEvent[]
  blockers: ActiveBlocker[]
  throughput: ThroughputSummary
  forecast: ForecastRecord
  narrative: string[]
}

// ── Engine inputs ─────────────────────────────────────────────────────────────

export interface AgentWeekInput {
  agentId: string
  meetings: MeetingType[]
  governanceEP: EffortPoints
  unplannedEP: EffortPoints
  activeStreams: number
  deliveryEP: EffortPoints
  reworkEP: EffortPoints
}
