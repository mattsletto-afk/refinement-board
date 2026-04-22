import { prisma } from './client'
import { calculateScores } from '@/src/domain/scoring'
import { buildSnapshotData } from '@/src/domain/archive'
import type { CarryForwardKey } from '@/src/domain/archive'
import type { Project, ProjectSnapshot, Workstream, PersonaPlacement, UserStory, Task, Epic, Feature, Milestone, Risk, Assumption } from '@/src/domain/types'

// ── Projects ──────────────────────────────────────────────────────────────────

export async function listProjects(clerkUserId?: string): Promise<Project[]> {
  const rows = await prisma.project.findMany({
    where: clerkUserId
      ? { OR: [{ clerkUserId }, { clerkUserId: null }] }
      : undefined,
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(serializeProject)
}

export async function getProject(id: string): Promise<Project | null> {
  const row = await prisma.project.findUnique({ where: { id } })
  return row ? serializeProject(row) : null
}

export async function createProject(data: { name: string; description?: string; color?: string; clerkUserId?: string }): Promise<Project> {
  const row = await prisma.project.create({
    data: {
      name: data.name,
      description: data.description ?? '',
      color: data.color ?? '#6366f1',
      clerkUserId: data.clerkUserId ?? null,
    },
  })
  return serializeProject(row)
}

export async function updateProject(
  id: string,
  data: Partial<{ name: string; description: string; color: string; status: string }>
): Promise<Project> {
  const row = await prisma.project.update({ where: { id }, data })
  return serializeProject(row)
}

// ── Archive / Snapshot ────────────────────────────────────────────────────────

export async function archiveProject(id: string): Promise<Project> {
  const row = await prisma.project.update({
    where: { id },
    data: { status: 'archived', archivedAt: new Date() },
  })
  return serializeProject(row)
}

export async function createSnapshot(
  projectId: string,
  name: string,
  description = ''
): Promise<ProjectSnapshot> {
  // Serialize full project state at this moment
  const [project, workstreams, placements, categories, epics, features, stories, tasks, milestones, risks, assumptions, decisions] =
    await Promise.all([
      prisma.project.findUniqueOrThrow({ where: { id: projectId } }),
      prisma.workstream.findMany({ where: { projectId } }),
      prisma.projectPersonaPlacement.findMany({ where: { projectId }, include: { persona: true } }),
      prisma.category.findMany({ where: { projectId } }),
      prisma.epic.findMany({ where: { projectId } }),
      prisma.feature.findMany({ where: { projectId } }),
      prisma.userStory.findMany({ where: { projectId } }),
      prisma.task.findMany({ where: { projectId } }),
      prisma.milestone.findMany({ where: { projectId } }),
      prisma.risk.findMany({ where: { projectId } }),
      prisma.assumption.findMany({ where: { projectId } }),
      prisma.decision.findMany({ where: { projectId } }),
    ])

  const dataJson = buildSnapshotData({
    project: serializeProject(project),
    workstreams: workstreams.map(serializeWorkstream),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    personas: placements.map((p) => ({
      id: p.id,
      projectId: p.projectId,
      personaId: p.personaId,
      workstreamId: p.workstreamId,
      sequence: p.sequence,
      createdAt: p.createdAt.toISOString(),
      persona: p.persona ? serializePersonaSnapshot(p.persona) : undefined,
    })) as PersonaPlacement[],
    categories: categories.map(serializeCategory),
    epics: epics.map(serializeEpic),
    features: features.map(serializeFeature),
    userStories: stories.map(serializeStory),
    tasks: tasks.map(serializeTask),
    milestones: milestones.map(serializeMilestone),
    risks: risks.map(serializeRisk),
    assumptions: assumptions.map(serializeAssumption),
    decisions: decisions.map(serializeDecision),
  })

  const row = await prisma.projectSnapshot.create({
    data: { projectId, name, description, dataJson },
  })

  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    dataJson: row.dataJson,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listSnapshots(projectId: string): Promise<ProjectSnapshot[]> {
  const rows = await prisma.projectSnapshot.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    name: r.name,
    description: r.description,
    dataJson: r.dataJson,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function getSnapshot(id: string): Promise<ProjectSnapshot | null> {
  const row = await prisma.projectSnapshot.findUnique({ where: { id } })
  if (!row) return null
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    dataJson: row.dataJson,
    createdAt: row.createdAt.toISOString(),
  }
}

// Start Fresh: snapshot + clear work items, optionally carry forward selected data
export async function startFresh(
  projectId: string,
  snapshotName: string,
  carryForward: CarryForwardKey[]
): Promise<{ snapshot: ProjectSnapshot; project: Project }> {
  const snapshot = await createSnapshot(projectId, snapshotName, 'Auto-snapshot before start fresh')

  // Always delete: stories, tasks, epics, features, dependencies, agent runs/suggestions
  await prisma.$transaction([
    prisma.agentSuggestion.deleteMany({ where: { run: { projectId } } }),
    prisma.agentRun.deleteMany({ where: { projectId } }),
    prisma.task.deleteMany({ where: { projectId } }),
    prisma.dependency.deleteMany({ where: { sourceType: 'story', targetType: 'story' } }),
    prisma.userStory.deleteMany({ where: { projectId } }),
    prisma.feature.deleteMany({ where: { projectId } }),
    prisma.epic.deleteMany({ where: { projectId } }),
    prisma.risk.deleteMany({ where: { projectId } }),
    prisma.assumption.deleteMany({ where: { projectId } }),
    prisma.decision.deleteMany({ where: { projectId } }),
  ])

  // Conditionally delete based on carry-forward selection
  if (!carryForward.includes('categories')) {
    await prisma.category.deleteMany({ where: { projectId } })
  }
  if (!carryForward.includes('workstreams')) {
    await prisma.workstream.deleteMany({ where: { projectId } })
  }
  if (!carryForward.includes('personas')) {
    await prisma.projectPersonaPlacement.deleteMany({ where: { projectId } })
  }
  if (!carryForward.includes('milestones')) {
    await prisma.milestone.deleteMany({ where: { projectId } })
  } else {
    // Only keep upcoming milestones
    await prisma.milestone.deleteMany({
      where: { projectId, status: { not: 'upcoming' } },
    })
  }

  const project = await getProject(projectId)
  return { snapshot, project: project! }
}

// ── Stories ───────────────────────────────────────────────────────────────────

export async function listStories(projectId: string) {
  const rows = await prisma.userStory.findMany({
    where: { projectId, parentStoryId: null },
    include: {
      tasks: { orderBy: { sequence: 'asc' } },
      children: { include: { tasks: { orderBy: { sequence: 'asc' } } } },
      category: true,
    },
    orderBy: [{ rank: 'asc' }, { finalScore: 'desc' }],
  })
  return rows.map(serializeStory)
}

export async function createStory(
  projectId: string,
  data: Partial<UserStory> & { title: string }
): Promise<UserStory> {
  const count = await prisma.userStory.count({ where: { projectId } })
  const scores = calculateScores({
    valueScore: data.valueScore ?? 3,
    riskScore: data.riskScore ?? 3,
    urgencyScore: data.urgencyScore ?? 3,
    effortScore: data.effortScore ?? 3,
    meetingPoints: data.meetingPoints ?? 0,
  })
  const { randomUUID } = await import('crypto')
  const row = await prisma.userStory.create({
    data: {
      id: data.id ?? randomUUID(),
      projectId,
      title: data.title,
      userStory: data.userStory ?? '',
      businessProblem: data.businessProblem ?? '',
      workstreamId: data.workstreamId ?? null,
      categoryId: data.categoryId ?? null,
      epicId: data.epicId ?? null,
      featureId: data.featureId ?? null,
      parentStoryId: data.parentStoryId ?? null,
      status: data.status ?? 'backlog',
      board: data.board ?? 'Current Backlog',
      priority: data.priority ?? 'medium',
      valueScore: data.valueScore ?? 3,
      riskScore: data.riskScore ?? 3,
      urgencyScore: data.urgencyScore ?? 3,
      effortScore: data.effortScore ?? 3,
      meetingPoints: data.meetingPoints ?? 0,
      ...scores,
      rank: count,
      requesterGroup: data.requesterGroup ?? '',
      tags: data.tags ?? '',
      notes: data.notes ?? '',
    },
    include: { tasks: true, children: true },
  })
  return serializeStory(row)
}

export async function updateStory(id: string, data: Partial<UserStory>): Promise<UserStory> {
  const current = await prisma.userStory.findUniqueOrThrow({ where: { id } })
  const scoreFields = ['valueScore', 'riskScore', 'urgencyScore', 'effortScore', 'meetingPoints'] as const
  const needsRecalc = scoreFields.some((f) => data[f] !== undefined)
  const scores = needsRecalc
    ? calculateScores({
        valueScore: data.valueScore ?? current.valueScore,
        riskScore: data.riskScore ?? current.riskScore,
        urgencyScore: data.urgencyScore ?? current.urgencyScore,
        effortScore: data.effortScore ?? current.effortScore,
        meetingPoints: data.meetingPoints ?? current.meetingPoints,
      })
    : {}

  const row = await prisma.userStory.update({
    where: { id },
    data: { ...data, ...scores } as Parameters<typeof prisma.userStory.update>[0]['data'],
    include: { tasks: true, children: true, category: true },
  })
  return serializeStory(row)
}

export async function deleteStory(id: string): Promise<void> {
  await prisma.userStory.delete({ where: { id } })
}

export async function rerankStories(ids: string[]): Promise<void> {
  await prisma.$transaction(ids.map((id, rank) => prisma.userStory.update({ where: { id }, data: { rank } })))
}

// ── Workstreams ───────────────────────────────────────────────────────────────

export async function listWorkstreams(projectId: string): Promise<Workstream[]> {
  const rows = await prisma.workstream.findMany({
    where: { projectId },
    orderBy: { sequence: 'asc' },
  })
  return rows.map(serializeWorkstream)
}

export async function upsertWorkstream(
  projectId: string,
  data: { id?: string; name: string; color?: string; sequence?: number; description?: string | null; focusAreas?: string[] }
): Promise<Workstream> {
  const focusAreasStr = data.focusAreas ? data.focusAreas.join(',') : undefined
  if (data.id) {
    const row = await prisma.workstream.update({
      where: { id: data.id },
      data: {
        name: data.name, color: data.color, sequence: data.sequence,
        ...(data.description !== undefined && { description: data.description }),
        ...(focusAreasStr !== undefined && { focusAreas: focusAreasStr }),
      },
    })
    return serializeWorkstream(row)
  }
  const count = await prisma.workstream.count({ where: { projectId } })
  const row = await prisma.workstream.create({
    data: { projectId, name: data.name, color: data.color ?? '#6366f1', sequence: data.sequence ?? count },
  })
  return serializeWorkstream(row)
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function createTask(
  projectId: string,
  storyId: string,
  data: Partial<Task> & { title: string }
): Promise<Task> {
  const count = await prisma.task.count({ where: { storyId } })
  const row = await prisma.task.create({
    data: {
      projectId,
      storyId,
      title: data.title,
      description: data.description ?? '',
      estimate: data.estimate ?? null,
      status: data.status ?? 'todo',
      sequence: count,
    },
  })
  return serializeTask(row)
}

export async function updateTask(id: string, data: Partial<Task>): Promise<Task> {
  const row = await prisma.task.update({
    where: { id },
    data: data as Parameters<typeof prisma.task.update>[0]['data'],
  })
  return serializeTask(row)
}

export async function deleteTask(id: string): Promise<void> {
  await prisma.task.delete({ where: { id } })
}

// ── Serializers (Prisma → domain types) ──────────────────────────────────────

function serializeProject(r: { id: string; name: string; description: string; status: string; color: string; archivedAt: Date | null; clerkUserId?: string | null; createdAt: Date; updatedAt: Date }): Project {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    status: r.status as Project['status'],
    color: r.color,
    archivedAt: r.archivedAt?.toISOString() ?? null,
    clerkUserId: r.clerkUserId ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

function serializePersonaSnapshot(r: { id: string; name: string; description: string; roleType: string; chesspiece: string; color: string; strengths: string; weaknesses: string; focusAreas: string; defaultPrompts: string; agentType: string; model: string | null; enabled: boolean; createdAt: Date; updatedAt: Date }) {
  return {
    id: r.id, name: r.name, description: r.description,
    roleType: r.roleType, chesspiece: r.chesspiece, color: r.color,
    strengths: r.strengths, weaknesses: r.weaknesses, focusAreas: r.focusAreas,
    defaultPrompts: safeParseJson(r.defaultPrompts, [] as string[]),
    agentType: r.agentType as 'human' | 'ai-agent', model: r.model, enabled: r.enabled,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  }
}

function serializeWorkstream(r: { id: string; projectId: string | null; name: string; color: string | null; sequence: number; description?: string | null; focusAreas?: string | null; createdAt: Date; updatedAt: Date }): Workstream {
  return {
    id: r.id,
    projectId: r.projectId ?? '',
    name: r.name,
    color: r.color ?? '#6366f1',
    sequence: r.sequence,
    description: r.description ?? null,
    focusAreas: r.focusAreas ? (r.focusAreas as string).split(',').map(s => s.trim()).filter(Boolean) : [],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

function serializeCategory(r: { id: string; projectId: string; workstreamId: string | null; name: string; color: string; sequence: number; createdAt: Date; updatedAt: Date }) {
  return { ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }
}

function serializeEpic(r: { id: string; projectId: string; workstreamId: string | null; title: string; description: string | null; status: string; priority: string; estimate: number | null; score: number | null; ownerId: string | null; tags: string | null; notes: string | null; sequence: number | null; committed?: boolean; createdAt: Date; updatedAt: Date }): Epic {
  return { ...r, description: r.description ?? '', score: r.score ?? 0, tags: r.tags ?? '', notes: r.notes ?? '', sequence: r.sequence ?? 0, committed: r.committed ?? false, status: r.status as Epic['status'], priority: r.priority as Epic['priority'], createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }
}

function serializeFeature(r: { id: string; projectId: string; epicId: string | null; workstreamId: string | null; title: string; description: string | null; status: string; priority: string; estimate: number | null; score: number | null; ownerId: string | null; tags: string | null; notes: string | null; sequence: number | null; committed?: boolean; createdAt: Date; updatedAt: Date }): Feature {
  return { ...r, description: r.description ?? '', score: r.score ?? 0, tags: r.tags ?? '', notes: r.notes ?? '', sequence: r.sequence ?? 0, committed: r.committed ?? false, status: r.status as Feature['status'], priority: r.priority as Feature['priority'], createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }
}

function serializeStory(r: Record<string, unknown> & { createdAt: Date; updatedAt: Date }): UserStory {
  const { createdAt, updatedAt, tasks, children, category, ...rest } = r as {
    createdAt: Date
    updatedAt: Date
    tasks?: unknown[]
    children?: unknown[]
    category?: unknown
    [key: string]: unknown
  }
  return {
    committed: false,
    ...rest,
    tasks: (tasks as Array<Record<string, unknown> & { createdAt: Date; updatedAt: Date }>)?.map(serializeTask) ?? [],
    children: children?.map((c) => serializeStory(c as Record<string, unknown> & { createdAt: Date; updatedAt: Date })) ?? [],
    category: category ? serializeCategory(category as Parameters<typeof serializeCategory>[0]) : undefined,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  } as UserStory
}

function serializeTask(r: Record<string, unknown> & { createdAt: Date; updatedAt: Date }): Task {
  return {
    ...(r as unknown as Omit<Task, 'createdAt' | 'updatedAt'>),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

function serializeMilestone(r: { id: string; projectId: string | null; workstreamId: string | null; title: string; description: string | null; targetDate: Date | null; status: string; createdAt: Date; updatedAt: Date }): Milestone {
  return { ...r, projectId: r.projectId ?? '', description: r.description ?? '', status: r.status as Milestone['status'], targetDate: r.targetDate?.toISOString() ?? null, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }
}

function serializeRisk(r: { id: string; projectId: string | null; workstreamId: string | null; title: string; description: string | null; probability: string | null; impact: string | null; status: string; mitigationPlan: string | null; ownerId: string | null; createdAt: Date; updatedAt: Date }): Risk {
  return { ...r, projectId: r.projectId ?? '', description: r.description ?? '', probability: (r.probability ?? '') as Risk['probability'], impact: (r.impact ?? '') as Risk['impact'], mitigationPlan: r.mitigationPlan ?? '', status: r.status as Risk['status'], createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }
}

function serializeAssumption(r: { id: string; projectId: string; workstreamId: string | null; title: string; description: string; status: string; ownerId: string | null; createdAt: Date; updatedAt: Date }): Assumption {
  return { ...r, status: r.status as Assumption['status'], createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }
}

function serializeDecision(r: { id: string; projectId: string; workstreamId: string | null; title: string; description: string; rationale: string; decidedAt: Date | null; ownerId: string | null; createdAt: Date; updatedAt: Date }) {
  return { ...r, decidedAt: r.decidedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }
}

function safeParseJson<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) } catch { return fallback }
}
