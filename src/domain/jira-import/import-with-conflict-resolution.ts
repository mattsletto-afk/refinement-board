import { randomUUID } from 'crypto'
import { prisma } from '@/src/infrastructure/db/client'
import {
  type ConflictStrategy,
  type JiraIssueImportRecord,
  type JiraEpicImportRecord,
  type ConflictResolutionResult,
  resolveStoryConflict,
  resolveEpicConflict,
  normalizeStatus,
  normalizePriority,
} from './conflict-resolution'

export interface ImportBatch {
  projectId: string
  epics: JiraEpicImportRecord[]
  stories: JiraIssueImportRecord[]
}

export interface ImportSummary {
  epics: {
    inserted: number
    skipped: number
    overwritten: number
    merged: number
  }
  stories: {
    inserted: number
    skipped: number
    overwritten: number
    merged: number
  }
  results: {
    epics: ConflictResolutionResult<{ id: string; pkey: string }>[]
    stories: ConflictResolutionResult<{ id: string; pkey: string }>[]
  }
}

export async function importWithConflictResolution(
  batch: ImportBatch,
  strategy: ConflictStrategy
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    epics: { inserted: 0, skipped: 0, overwritten: 0, merged: 0 },
    stories: { inserted: 0, skipped: 0, overwritten: 0, merged: 0 },
    results: { epics: [], stories: [] },
  }

  const epicPkeyToId = new Map<string, string>()

  for (const epicRecord of batch.epics) {
    const existing = await prisma.epic.findFirst({
      where: { title: { startsWith: epicRecord.pkey + ' ' } },
    })

    const exactMatch = await prisma.epic.findFirst({
      where: { title: epicRecord.pkey },
    })

    const existingEpic = exactMatch ?? existing

    const resolution = resolveEpicConflict(epicRecord, existingEpic, strategy)

    if (resolution.action === 'skip') {
      summary.epics.skipped++
      summary.results.epics.push({
        record: { id: existingEpic!.id, pkey: epicRecord.pkey },
        outcome: 'skipped',
        pkey: epicRecord.pkey,
      })
      epicPkeyToId.set(epicRecord.pkey, existingEpic!.id)
      continue
    }

    if (resolution.action === 'insert') {
      const created = await prisma.epic.create({
        data: {
          title: epicRecord.title,
          status: normalizeStatus(epicRecord.status) as 'backlog' | 'active' | 'done',
          priority: normalizePriority(epicRecord.priority) as
            | 'low'
            | 'medium'
            | 'high'
            | 'critical',
        },
      })
      summary.epics.inserted++
      summary.results.epics.push({
        record: { id: created.id, pkey: epicRecord.pkey },
        outcome: 'inserted',
        pkey: epicRecord.pkey,
      })
      epicPkeyToId.set(epicRecord.pkey, created.id)
      continue
    }

    const updateData: Record<string, string> = {}
    if (resolution.data.title) updateData.title = resolution.data.title
    if (resolution.data.status)
      updateData.status = normalizeStatus(resolution.data.status)
    if (resolution.data.priority)
      updateData.priority = normalizePriority(resolution.data.priority)

    const updated = await prisma.epic.update({
      where: { id: existingEpic!.id },
      data: updateData,
    })

    const outcome = strategy === 'overwrite' ? 'overwritten' : 'merged'
    summary.epics[outcome]++
    summary.results.epics.push({
      record: { id: updated.id, pkey: epicRecord.pkey },
      outcome,
      pkey: epicRecord.pkey,
    })
    epicPkeyToId.set(epicRecord.pkey, updated.id)
  }

  for (const storyRecord of batch.stories) {
    const existing = await prisma.userStory.findFirst({
      where: { title: { startsWith: storyRecord.pkey + ' ' } },
    })

    const exactMatch = await prisma.userStory.findFirst({
      where: { title: storyRecord.pkey },
    })

    const existingStory = exactMatch ?? existing

    const resolvedEpicId = storyRecord.epicId
      ? epicPkeyToId.get(storyRecord.epicId) ?? storyRecord.epicId
      : null

    const recordWithResolvedEpic: JiraIssueImportRecord = {
      ...storyRecord,
      epicId: resolvedEpicId,
    }

    const resolution = resolveStoryConflict(
      recordWithResolvedEpic,
      existingStory,
      strategy
    )

    if (resolution.action === 'skip') {
      summary.stories.skipped++
      summary.results.stories.push({
        record: { id: existingStory!.id, pkey: storyRecord.pkey },
        outcome: 'skipped',
        pkey: storyRecord.pkey,
      })
      continue
    }

    if (resolution.action === 'insert') {
      const created = await prisma.userStory.create({
        data: {
          id:        randomUUID(),
          projectId: batch.projectId,
          title:     storyRecord.title,
          status:    normalizeStatus(storyRecord.status) as 'backlog' | 'active' | 'done',
          epicId:    resolvedEpicId,
          featureId: storyRecord.featureId ?? null,
        },
      })
      summary.stories.inserted++
      summary.results.stories.push({
        record: { id: created.id, pkey: storyRecord.pkey },
        outcome: 'inserted',
        pkey: storyRecord.pkey,
      })
      continue
    }

    const updateData: Record<string, string | null> = {}
    if (resolution.data.title) updateData.title = resolution.data.title
    if (resolution.data.status)
      updateData.status = normalizeStatus(resolution.data.status)
    if ('epicId' in resolution.data) updateData.epicId = resolution.data.epicId ?? null
    if ('featureId' in resolution.data)
      updateData.featureId = resolution.data.featureId ?? null

    const updated = await prisma.userStory.update({
      where: { id: existingStory!.id },
      data: updateData,
    })

    const outcome = strategy === 'overwrite' ? 'overwritten' : 'merged'
    summary.stories[outcome]++
    summary.results.stories.push({
      record: { id: updated.id, pkey: storyRecord.pkey },
      outcome,
      pkey: storyRecord.pkey,
    })
  }

  return summary
}
