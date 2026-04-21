import { NextResponse } from 'next/server'
import { prisma } from '@/src/infrastructure/db/client'

type Ctx = { params: Promise<{ id: string }> }

// Azure DevOps CSV bulk-import format using hierarchical title columns.
// Title 1 = Epic, Title 2 = Feature, Title 3 = User Story
// Each row has exactly one title column populated; hierarchy is implied.
// Import via ADO Boards → Backlogs → … → Import work items

function esc(s: string | null | undefined): string {
  if (!s) return ''
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function priorityNum(p: string | null | undefined): number {
  if (p === 'critical') return 1
  if (p === 'high') return 2
  if (p === 'low') return 4
  return 3
}

// SQLite stores booleans as 0/1 integers; use raw queries with literal 1
interface RawEpic { id: string; title: string; description: string | null; priority: string | null; tags: string | null; sequence: number | null }
interface RawFeature { id: string; epicId: string | null; title: string; description: string | null; priority: string | null; tags: string | null; sequence: number | null }
interface RawStory { id: string; epicId: string | null; featureId: string | null; title: string; userStory: string | null; businessProblem: string | null; priority: string | null; tags: string | null; rank: number }

export async function GET(_: Request, { params }: Ctx) {
  const { id: projectId } = await params

  // Use raw SQL since `committed` is not in the Prisma schema yet
  const [epics, features, stories] = await Promise.all([
    prisma.$queryRaw<RawEpic[]>`
      SELECT id, title, description, priority, tags, sequence
      FROM "Epic"
      WHERE "projectId" = ${projectId} AND "committed" = 1
      ORDER BY sequence ASC`,
    prisma.$queryRaw<RawFeature[]>`
      SELECT id, "epicId", title, description, priority, tags, sequence
      FROM "Feature"
      WHERE "projectId" = ${projectId} AND "committed" = 1
      ORDER BY sequence ASC`,
    prisma.$queryRaw<RawStory[]>`
      SELECT id, "epicId", "featureId", title, "userStory", "businessProblem", priority, tags, rank
      FROM "UserStory"
      WHERE "projectId" = ${projectId} AND "committed" = 1 AND status != 'archived'
      ORDER BY rank ASC`,
  ])

  const featuresByEpic = new Map<string | null, RawFeature[]>()
  for (const f of features) {
    const key = f.epicId ?? null
    if (!featuresByEpic.has(key)) featuresByEpic.set(key, [])
    featuresByEpic.get(key)!.push(f)
  }

  const storiesByFeature = new Map<string, RawStory[]>()
  const storiesByEpic = new Map<string | null, RawStory[]>()
  for (const s of stories) {
    if (s.featureId) {
      if (!storiesByFeature.has(s.featureId)) storiesByFeature.set(s.featureId, [])
      storiesByFeature.get(s.featureId)!.push(s)
    } else {
      const key = s.epicId ?? null
      if (!storiesByEpic.has(key)) storiesByEpic.set(key, [])
      storiesByEpic.get(key)!.push(s)
    }
  }

  const header = ['Work Item Type', 'Title 1', 'Title 2', 'Title 3', 'State', 'Priority', 'Description', 'Tags']
  const rows: string[][] = [header]

  for (const epic of epics) {
    rows.push(['Epic', esc(epic.title), '', '', 'New', String(priorityNum(epic.priority)), esc(epic.description), esc(epic.tags)])

    for (const feature of featuresByEpic.get(epic.id) ?? []) {
      rows.push(['Feature', '', esc(feature.title), '', 'New', String(priorityNum(feature.priority)), esc(feature.description), esc(feature.tags)])

      for (const story of storiesByFeature.get(feature.id) ?? []) {
        const desc = story.userStory || story.businessProblem || ''
        rows.push(['User Story', '', '', esc(story.title), 'New', String(priorityNum(story.priority)), esc(desc), esc(story.tags)])
      }
    }

    for (const story of storiesByEpic.get(epic.id) ?? []) {
      const desc = story.userStory || story.businessProblem || ''
      rows.push(['User Story', '', '', esc(story.title), 'New', String(priorityNum(story.priority)), esc(desc), esc(story.tags)])
    }
  }

  for (const story of storiesByEpic.get(null) ?? []) {
    const desc = story.userStory || story.businessProblem || ''
    rows.push(['User Story', '', '', esc(story.title), 'New', String(priorityNum(story.priority)), esc(desc), esc(story.tags)])
  }

  const csv = rows.map(r => r.join(',')).join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="ado-import-committed.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
