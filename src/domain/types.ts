// Core domain types for Refinement Board v2.
// These mirror the Prisma schema but are decoupled from it —
// use these in application and presentation layers, not Prisma types directly.

// ── Enums / literals ─────────────────────────────────────────────────────────

export type ProjectStatus = 'active' | 'archived' | 'template'
export type WorkItemStatus = 'backlog' | 'active' | 'done' | 'archived'
export type Priority = 'critical' | 'high' | 'medium' | 'low'
export type TaskStatus = 'todo' | 'in-progress' | 'done' | 'blocked'
export type DependencyType = 'depends_on' | 'blocks' | 'related'
export type AgentType =
  // Core planning
  | 'project-planner'
  | 'scheduling'
  | 'cohesion-reviewer'
  | 'product-improvement'
  // Delivery & engineering
  | 'delivery-lead'
  | 'technical-architect'
  | 'devops-engineer'
  // Domain & stakeholder
  | 'domain-expert'
  | 'executive-sponsor'
  | 'reporting-analyst'
  // Operations & risk
  | 'operations-lead'
  | 'risk-analyst'
  // Simulation mechanics
  | 'simulation-driver'
  | 'meeting-facilitator'
  | 'artifact-governor'
  | 'authority-engine'
  // Legacy aliases kept for backwards compatibility
  | 'delivery'
export type AgentMode = 'recommend' | 'draft' | 'apply'
export type AgentRunStatus = 'pending' | 'running' | 'complete' | 'failed'
export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'applied'
export type ReviewStatus = 'unreviewed' | 'reviewed'
export type ConfidenceLevel = 'low' | 'medium' | 'high'
export type ExportType = 'csv' | 'excel' | 'markdown' | 'json' | 'pptx'
export type ExportJobStatus = 'pending' | 'running' | 'complete' | 'failed'
export type PersonaRole = 'contributor' | 'lead' | 'reviewer' | 'observer'
export type Chesspiece = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn'
export type PostType = 'changelog' | 'announcement' | 'note'
export type MilestoneStatus = 'upcoming' | 'hit' | 'missed' | 'deferred'
export type RiskLevel = 'low' | 'medium' | 'high'
export type RiskStatus = 'open' | 'mitigated' | 'accepted' | 'closed'
export type AssumptionStatus = 'active' | 'validated' | 'invalidated'
export type Board = 'Current Backlog' | 'Discovery' | 'Longer Term' | 'UMQ' | 'Marketing' | 'Product' | 'Complete'

// ── Projects ─────────────────────────────────────────────────────────────────

export interface Project {
  id: string
  name: string
  description: string
  status: ProjectStatus
  color: string
  archivedAt: string | null
  clerkUserId: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectSnapshot {
  id: string
  projectId: string
  name: string
  description: string
  dataJson: string // serialized ProjectExport
  createdAt: string
}

export interface ProjectExport {
  project: Project
  workstreams: Workstream[]
  personas: PersonaPlacement[]
  categories: Category[]
  epics: Epic[]
  features: Feature[]
  userStories: UserStory[]
  tasks: Task[]
  milestones: Milestone[]
  risks: Risk[]
  assumptions: Assumption[]
  decisions: Decision[]
  exportedAt: string
}

// ── Workstreams ───────────────────────────────────────────────────────────────

export interface Workstream {
  id: string
  projectId: string
  name: string
  color: string
  sequence: number
  description: string | null
  focusAreas: string[]
  createdAt: string
  updatedAt: string
}

// ── Personas ──────────────────────────────────────────────────────────────────

export interface Persona {
  id: string
  name: string
  description: string
  roleType: PersonaRole
  chesspiece: Chesspiece
  color: string
  strengths: string
  weaknesses: string
  focusAreas: string
  defaultPrompts: string[] // parsed from JSON
  systemPrompt: string
  agentType: 'human' | 'ai-agent'
  model: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface PersonaPlacement {
  id: string
  projectId: string
  personaId: string
  workstreamId: string | null
  sequence: number
  createdAt: string
  persona?: Persona
  workstream?: Workstream
}

// ── Work items ────────────────────────────────────────────────────────────────

export interface Category {
  id: string
  projectId: string
  workstreamId: string | null
  name: string
  color: string
  sequence: number
  createdAt: string
  updatedAt: string
}

export interface Epic {
  id: string
  projectId: string
  workstreamId: string | null
  title: string
  description: string
  status: WorkItemStatus
  priority: Priority
  estimate: number | null
  score: number
  ownerId: string | null
  tags: string
  notes: string
  sequence: number
  committed: boolean
  createdAt: string
  updatedAt: string
  features?: Feature[]
  userStories?: UserStory[]
}

export interface Feature {
  id: string
  projectId: string
  epicId: string | null
  workstreamId: string | null
  title: string
  description: string
  status: WorkItemStatus
  priority: Priority
  estimate: number | null
  score: number
  ownerId: string | null
  tags: string
  notes: string
  sequence: number
  committed: boolean
  createdAt: string
  updatedAt: string
  userStories?: UserStory[]
}

export interface UserStory {
  id: string
  projectId: string
  workstreamId: string | null
  categoryId: string | null
  epicId: string | null
  featureId: string | null
  parentStoryId: string | null

  title: string
  userStory: string
  businessProblem: string
  status: WorkItemStatus
  board: Board
  priority: Priority

  valueScore: number
  riskScore: number
  urgencyScore: number
  effortScore: number
  meetingPoints: number
  baseScore: number
  finalScore: number

  rank: number
  inScope: boolean
  committed: boolean
  targetWindow: string | null
  requesterGroup: string
  ownerId: string | null
  tags: string
  notes: string
  sprintWeekStart: number | null
  sprintWeekEnd: number | null
  sprintStream: string | null
  estimate: number | null
  createdAt: string
  updatedAt: string

  tasks?: Task[]
  children?: UserStory[]
  dependsOn?: Dependency[]
  blockedBy?: Dependency[]
  category?: Category
  epic?: Epic
  feature?: Feature
}

export interface Task {
  id: string
  projectId: string
  storyId: string | null
  title: string
  description: string
  estimate: number | null
  status: TaskStatus
  sequence: number
  ownerId: string | null
  blockedByTaskId: string | null
  createdAt: string
  updatedAt: string
}

export interface Dependency {
  id: string
  sourceId: string
  sourceType: 'story' | 'feature' | 'epic'
  targetId: string
  targetType: 'story' | 'feature' | 'epic'
  type: DependencyType
  notes: string
  createdAt: string
}

// ── Planning objects ──────────────────────────────────────────────────────────

export interface Milestone {
  id: string
  projectId: string
  workstreamId: string | null
  title: string
  description: string
  targetDate: string | null
  status: MilestoneStatus
  createdAt: string
  updatedAt: string
}

export interface Risk {
  id: string
  projectId: string
  workstreamId: string | null
  title: string
  description: string
  probability: RiskLevel
  impact: RiskLevel
  status: RiskStatus
  mitigationPlan: string
  ownerId: string | null
  createdAt: string
  updatedAt: string
}

export interface Assumption {
  id: string
  projectId: string
  workstreamId: string | null
  title: string
  description: string
  status: AssumptionStatus
  ownerId: string | null
  createdAt: string
  updatedAt: string
}

export interface Decision {
  id: string
  projectId: string
  workstreamId: string | null
  title: string
  description: string
  rationale: string
  decidedAt: string | null
  ownerId: string | null
  createdAt: string
  updatedAt: string
}

// ── Agent system ──────────────────────────────────────────────────────────────

export interface AgentRun {
  id: string
  projectId: string
  agentType: AgentType
  mode: AgentMode
  status: AgentRunStatus
  summary: string
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  suggestions?: AgentSuggestion[]
}

export interface AgentSuggestion {
  id: string
  runId: string
  type: 'create' | 'update' | 'delete' | 'comment' | 'bundle'
  summary: string
  rationale: string
  proposedChanges: Record<string, unknown>
  confidenceLevel: ConfidenceLevel
  impactedEntities: ImpactedEntity[]
  status: SuggestionStatus
  reviewStatus: ReviewStatus
  reviewedAt: string | null
  reviewedBy: string | null
  createdAt: string
}

export interface ImpactedEntity {
  type: string
  id: string
  title: string
}

// ── Export system ─────────────────────────────────────────────────────────────

export interface ExportTemplate {
  id: string
  name: string
  type: ExportType
  description: string
  config: Record<string, unknown>
  isBuiltIn: boolean
  createdAt: string
  updatedAt: string
}

export interface ExportJob {
  id: string
  projectId: string
  templateId: string | null
  type: ExportType
  status: ExportJobStatus
  filePath: string | null
  errorMsg: string | null
  metadata: Record<string, unknown>
  createdAt: string
  completedAt: string | null
}

// ── Posts ─────────────────────────────────────────────────────────────────────

export interface Post {
  id: string
  projectId: string | null
  title: string
  content: string
  type: PostType
  pinned: boolean
  createdAt: string
  updatedAt: string
}

// ── Calendar ─────────────────────────────────────────────────────────────────

export interface CalendarRecurrence {
  type: 'daily' | 'weekly'
  days?: number[]   // 0=Sun … 6=Sat
  endDate?: string  // YYYY-MM-DD
}

export interface CalendarEventStoryLink {
  storyId: string
  role: string
  story: { id: string; title: string; status: string; finalScore?: number }
}

export interface CalendarEvent {
  id: string
  projectId: string
  date: string        // YYYY-MM-DD
  startHour: number
  durationMins: number
  title: string
  type: 'meeting' | 'milestone'
  notes: string | null
  transcript: string | null
  recurrence: CalendarRecurrence | null
  personaIds: string[]
  eventStories: CalendarEventStoryLink[]
  createdAt: string
  updatedAt: string
}

// ── Scoring ───────────────────────────────────────────────────────────────────

export interface ScoreInputs {
  valueScore: number
  riskScore: number
  urgencyScore: number
  effortScore: number
  meetingPoints: number
}

export interface ScoreResult {
  baseScore: number
  finalScore: number
}
