import { z } from 'zod'

// ── Primitives ────────────────────────────────────────────────────────────────

export const EffortPointsSchema = z.number().nonnegative()

export const WorkCategorySchema = z.enum([
  'delivery', 'coordination', 'reporting', 'review', 'rework', 'unplanned', 'blocked',
])

export const ProgressStateSchema = z.enum([
  'not-started', 'started', 'in-progress', 'substantial', 'review-ready', 'accepted', 'done',
])

export const AgentRoleSchema = z.enum(['delivery', 'coordinator', 'reviewer', 'executive'])

export const MeetingTypeSchema = z.enum([
  'daily-standup', 'weekly-review', 'blocker-workshop', 'executive-checkpoint',
  'sprint-planning', 'retrospective', 'ad-hoc-sync',
])

export const BlockerSeveritySchema = z.enum(['soft', 'hard', 'systemic'])

export const ReworkSeveritySchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])

export const ForecastConfidenceSchema = z.enum(['on-track', 'at-risk', 'off-track'])

// ── Core data models ──────────────────────────────────────────────────────────

export const AgentCapacityProfileSchema = z.object({
  agentId: z.string().min(1),
  role: AgentRoleSchema,
  nominalWeeklyEP: EffortPointsSchema,
  maxDeliveryFraction: z.number().min(0).max(1),
}).strict()

export const WeeklyCapacityUsageSchema = z.object({
  agentId: z.string().min(1),
  week: z.number().int().positive(),
  nominal: EffortPointsSchema,
  meetingCost: EffortPointsSchema,
  governanceCost: EffortPointsSchema,
  blockerDrag: EffortPointsSchema,
  switchingPenalty: EffortPointsSchema,
  unplannedWork: EffortPointsSchema,
  reworkCost: EffortPointsSchema,
  effective: EffortPointsSchema,
  deliveryEP: EffortPointsSchema,
  utilisation: z.number().min(0).max(1),
  breakdown: z.record(WorkCategorySchema, EffortPointsSchema),
}).strict()

export const ReworkEventSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  severity: ReworkSeveritySchema,
  week: z.number().int().positive(),
  originalEffortEP: EffortPointsSchema,
  reworkEffortEP: EffortPointsSchema,
  description: z.string(),
  triggeredBy: z.string(),
  downstreamTaskIds: z.array(z.string()),
}).strict()

export const TaskEconomicsSchema = z.object({
  taskId: z.string().min(1),
  title: z.string().min(1),
  ownerAgentId: z.string().min(1),
  plannedEP: EffortPointsSchema,
  actualEP: EffortPointsSchema,
  state: ProgressStateSchema,
  progressPct: z.number().min(0).max(100),
  reworkEvents: z.array(ReworkEventSchema),
  blockerIds: z.array(z.string()),
  stateEnteredWeek: z.number().int().positive(),
  downstreamTaskIds: z.array(z.string()),
}).strict()

export const ArtifactEconomicsSchema = z.object({
  artifactId: z.string().min(1),
  artifactClass: z.string().min(1),
  ownerAgentId: z.string().min(1),
  creationEP: EffortPointsSchema,
  maintenanceEP: EffortPointsSchema,
  reviewEP: EffortPointsSchema,
  state: ProgressStateSchema,
  valid: z.boolean(),
  lastUpdatedWeek: z.number().int().positive(),
}).strict()

export const ActiveBlockerSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  severity: BlockerSeveritySchema,
  startWeek: z.number().int().positive(),
  resolvedWeek: z.number().int().positive().nullable(),
  description: z.string(),
  affectedAgentIds: z.array(z.string()),
}).strict()

export const ThroughputSummarySchema = z.object({
  period: z.enum(['week', 'month', 'quarter']),
  periodNumber: z.number().int().positive(),
  nominalEP: EffortPointsSchema,
  plannedDeliveryEP: EffortPointsSchema,
  actualDeliveryEP: EffortPointsSchema,
  overheadEP: EffortPointsSchema,
  reworkEP: EffortPointsSchema,
  blockedEP: EffortPointsSchema,
  tasksCompleted: z.number().int().nonnegative(),
  tasksInFlight: z.number().int().nonnegative(),
  efficiency: z.number().min(0).max(1),
}).strict()

export const ForecastRecordSchema = z.object({
  week: z.number().int().positive(),
  originalTargetWeek: z.number().int().positive(),
  currentForecastWeek: z.number().int().positive(),
  slippage: z.number(),
  confidence: ForecastConfidenceSchema,
  reasons: z.array(z.string()),
}).strict()

export const EffortVarianceRecordSchema = z.object({
  taskId: z.string().min(1),
  week: z.number().int().positive(),
  plannedEP: EffortPointsSchema,
  actualEP: EffortPointsSchema,
  weeklyVariance: z.number(),
  cumulativeVariance: z.number(),
  forecastCompletionWeek: z.number().int().positive().nullable(),
}).strict()
