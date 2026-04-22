import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/infrastructure/db/client'
import { serializeProjectAsJiraXml } from '@/src/domain/export/jiraXmlExporter'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const projectKey = req.nextUrl.searchParams.get('projectKey') ?? 'RB'

  const [epicsRaw, featuresRaw, storiesRaw, milestones, workstreams] = await Promise.all([
    prisma.epic.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.feature.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.userStory.findMany({ include: { tasks: { orderBy: { sequence: 'asc' } } }, orderBy: { createdAt: 'asc' } }),
    prisma.milestone.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.workstream.findMany({ orderBy: { createdAt: 'asc' } }),
  ])

  const storyByFeature = new Map<string, typeof storiesRaw>()
  const storyByEpic = new Map<string, typeof storiesRaw>()
  const orphanStories: typeof storiesRaw = []
  for (const s of storiesRaw) {
    if (s.featureId) {
      storyByFeature.set(s.featureId, [...(storyByFeature.get(s.featureId) ?? []), s])
    } else if (s.epicId) {
      storyByEpic.set(s.epicId, [...(storyByEpic.get(s.epicId) ?? []), s])
    } else {
      orphanStories.push(s)
    }
  }
  const featureByEpic = new Map<string, typeof featuresRaw>()
  for (const f of featuresRaw) {
    if (f.epicId) featureByEpic.set(f.epicId, [...(featureByEpic.get(f.epicId) ?? []), f])
  }
  const epics = epicsRaw.map(e => ({
    ...e,
    features: (featureByEpic.get(e.id) ?? []).map(f => ({ ...f, stories: storyByFeature.get(f.id) ?? [] })),
    stories: storyByEpic.get(e.id) ?? [],
  }))

  const xml = serializeProjectAsJiraXml({
    projectKey,
    projectName: 'Refinement Board',
    projectDescription: null,
    epics,
    orphanStories,
    milestones,
    workstreams,
    sprints: [],
    sprintStories: [],
  })

  const date = new Date().toISOString().split('T')[0]
  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${projectKey}-jira-export-${date}.xml"`,
    },
  })
}
