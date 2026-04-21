import { prisma } from '@/src/infrastructure/db/client'
import type { ProjectExportData } from '@/src/domain/export/markdownSerializer'

export async function loadProjectExportData(projectName: string): Promise<ProjectExportData> {
  const [epicsRaw, featuresRaw, storiesRaw, risks, milestones] = await Promise.all([
    prisma.epic.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.feature.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.userStory.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.risk.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.milestone.findMany({ orderBy: { createdAt: 'asc' } }),
  ])

  const storyByFeature = new Map<string, typeof storiesRaw>()
  const storyByEpic = new Map<string, typeof storiesRaw>()
  const orphanStories: typeof storiesRaw = []

  for (const story of storiesRaw) {
    if (story.featureId) {
      const existing = storyByFeature.get(story.featureId) ?? []
      existing.push(story)
      storyByFeature.set(story.featureId, existing)
    } else if (story.epicId) {
      const existing = storyByEpic.get(story.epicId) ?? []
      existing.push(story)
      storyByEpic.set(story.epicId, existing)
    } else {
      orphanStories.push(story)
    }
  }

  const featureByEpic = new Map<string, typeof featuresRaw>()
  for (const feature of featuresRaw) {
    if (feature.epicId) {
      const existing = featureByEpic.get(feature.epicId) ?? []
      existing.push(feature)
      featureByEpic.set(feature.epicId, existing)
    }
  }

  const addTasks = <T>(stories: T[]) => stories.map(s => ({ ...s, tasks: [] as import('@/app/generated/prisma').Task[] }))

  const epics = epicsRaw.map(epic => ({
    ...epic,
    features: (featureByEpic.get(epic.id) ?? []).map(feature => ({
      ...feature,
      stories: addTasks(storyByFeature.get(feature.id) ?? []),
    })),
    stories: addTasks(storyByEpic.get(epic.id) ?? []),
  }))

  return {
    projectName,
    exportedAt: new Date(),
    epics,
    orphanStories: addTasks(orphanStories),
    risks,
    milestones,
  } as import('@/src/domain/export/markdownSerializer').ProjectExportData
}
