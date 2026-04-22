/**
 * work-economics
 *
 * A work economics framework for multi-agent project simulation.
 * Models how capacity, meetings, blockers, rework, context switching,
 * and governance overhead determine what a team can actually deliver.
 *
 * ── Quick start ───────────────────────────────────────────────────────────────
 *
 *   import { buildFourWeekSimulation, FIXTURE_SIMULATION } from '@/src/work-economics'
 *
 *   const weeks = buildFourWeekSimulation()
 *   console.log(weeks[3].forecast)      // ForecastRecord — slippage, confidence
 *   console.log(weeks[3].throughput)    // ThroughputSummary — efficiency, EP breakdown
 *   console.log(weeks[3].narrative)     // Human-readable week summary
 *
 * ── Core concepts ─────────────────────────────────────────────────────────────
 *
 *   Effort Points (EP): 1 EP ≈ 2 focused hours. 20 EP = full working week.
 *
 *   Nominal → Effective → Delivery:
 *     Nominal EP (20) − meetings − governance − blockers − switching − unplanned
 *     = Effective EP
 *     min(Effective, role ceiling) = Delivery EP
 *
 *   Progress states: not-started → started → in-progress → substantial →
 *     review-ready → accepted → done.
 *     Work never advances automatically. Effort must be explicitly applied.
 *     Review is required to move past review-ready.
 *
 *   Rework severity 1–4: 0.5×–3.0× original effort cost. Severity ≥ 3
 *     invalidates downstream tasks and artifacts; shifts delivery forecast.
 *
 *   Blockers: soft (30% drag), hard (100% blocking), systemic (contagious).
 *
 *   Context switching: 1–5+ active streams → 0–7+ EP penalty per week.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type {
  EffortPoints,
  WorkCategory,
  ProgressState,
  AgentRole,
  AgentCapacityProfile,
  WeeklyCapacityUsage,
  MeetingType,
  MeetingCost,
  BlockerSeverity,
  BlockerDefinition,
  ActiveBlocker,
  ReworkSeverity,
  ReworkDefinition,
  ReworkEvent,
  SwitchingProfile,
  TaskEconomics,
  ArtifactEconomics,
  EffortVarianceRecord,
  ThroughputSummary,
  ForecastConfidence,
  ForecastRecord,
  SimulationWeek,
  AgentWeekInput,
} from './types'

// ── Schemas ───────────────────────────────────────────────────────────────────

export {
  EffortPointsSchema,
  WorkCategorySchema,
  ProgressStateSchema,
  AgentRoleSchema,
  MeetingTypeSchema,
  BlockerSeveritySchema,
  ReworkSeveritySchema,
  ForecastConfidenceSchema,
  AgentCapacityProfileSchema,
  WeeklyCapacityUsageSchema,
  ReworkEventSchema,
  TaskEconomicsSchema,
  ArtifactEconomicsSchema,
  ActiveBlockerSchema,
  ThroughputSummarySchema,
  ForecastRecordSchema,
  EffortVarianceRecordSchema,
} from './schemas'

// ── Capacity ──────────────────────────────────────────────────────────────────

export {
  NOMINAL_WEEKLY_EP,
  ROLE_DEFAULTS,
  GOVERNANCE_BASELINE_EP,
  UNPLANNED_BASELINE_EP,
  computeEffectiveCapacity,
  computeDeliveryCeiling,
  computeUtilisation,
} from './capacity'

// ── Meetings ──────────────────────────────────────────────────────────────────

export {
  MEETING_COSTS,
  computeAgentMeetingCost,
  standardWeekMeetings,
  meetingCostBreakdown,
} from './meetings'

// ── Rework ────────────────────────────────────────────────────────────────────

export {
  REWORK_DEFINITIONS,
  computeReworkEffort,
  applyReworkToTask,
  reworkForecastSlip,
  totalReworkEP,
  progressPctToState,
} from './rework'

// ── Blockers ──────────────────────────────────────────────────────────────────

export {
  BLOCKER_DEFINITIONS,
  computeBlockerDrag,
  computeBlockerOverhead,
  isBlockerActive,
  resolveBlocker,
  activeBlockersForTask,
  isTaskHardBlocked,
} from './blockers'

// ── Context switching ─────────────────────────────────────────────────────────

export {
  SWITCHING_PROFILES,
  computeSwitchingPenalty,
  switchingLabel,
  maxSafeStreams,
} from './switching'

// ── Progress ──────────────────────────────────────────────────────────────────

export {
  PROGRESS_THRESHOLDS,
  applyEffort,
  applyReview,
  closeTask,
  remainingEffort,
  forecastCompletionWeek,
  computeVariance,
} from './progress'

// ── Engine ────────────────────────────────────────────────────────────────────

export {
  RULES,
  computeAgentWeek,
  stepTasks,
  applyReworkEvents,
  computeWeekThroughput,
  computeForecast,
  assembleWeek,
} from './engine'

// ── Fixtures ──────────────────────────────────────────────────────────────────

export {
  FIXTURE_AGENTS,
  FIXTURE_BLOCKER_WEEK2,
  FIXTURE_REWORK_WEEK3,
  FIXTURE_REWORK_WEEK4,
  FIXTURE_WEEK1,
  FIXTURE_WEEK2,
  FIXTURE_WEEK3,
  FIXTURE_WEEK4,
  FIXTURE_SIMULATION,
  buildFourWeekSimulation,
  makeTasks,
  makeArtifacts,
  buildWeek1,
  buildWeek2,
  buildWeek3,
  buildWeek4,
} from './fixtures'
