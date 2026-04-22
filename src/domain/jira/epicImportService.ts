import { randomUUID } from 'crypto'
import { prisma } from '@/src/infrastructure/db/client'
import type { JiraIssueRow } from './types'
import { buildEpicHierarchy } from './epicAdapter'
import { resolveEpicLinks, groupChildrenByEpic } from './epicLinkResolver'

export interface EpicImportSummary {
  epicsCreated: number
  epicsSkipped: number
  storiesLinked: number
  storiesUnlinked: number
  unmatchedEpicLinks: string[]
}

export interface EpicImportOptions {
  projectId: string
  onConflict: 'skip' | 'overwrite'
}

export async function importJiraEpicsAndHierarchy(
  rows: JiraIssueRow[],
  options: EpicImportOptions
): Promise<EpicImportSummary> {
  const hierarchy = buildEpicHierarchy(rows)
  const resolution = resolveEpicLinks(hierarchy)
  const childrenByEpic = groupChildrenByEpic(resolution.resolvedChildren)

  let epicsCreated = 0
  let epicsSkipped = 0
  let storiesLinked = 0
  let storiesUnlinked = 0

  const epicPkeyToDbId = new Map<string, string>()

  for (const epic of resolution.epics) {
    const existing = await prisma.epic.findFirst({
      where: { title: epic.pkey },
    })

    if (existing && options.onConflict === 'skip') {
      epicsSkipped++
      epicPkeyToDbId.set(epic.jiraId, existing.id)
      continue
    }

    if (existing && options.onConflict === 'overwrite') {
      const updated = await prisma.epic.update({
        where: { id: existing.id },
        data: {
          title: epic.title,
          status: epic.status as 'backlog' | 'active' | 'done',
          priority: epic.priority as 'low' | 'medium' | 'high' | 'critical',
        },
      })
      epicsCreated++
      epicPkeyToDbId.set(epic.jiraId, updated.id)
      continue
    }

    const created = await prisma.epic.create({
      data: {
        title: epic.title,
        status: epic.status as 'backlog' | 'active' | 'done',
        priority: epic.priority as 'low' | 'medium' | 'high' | 'critical',
      },
    })
    epicsCreated++
    epicPkeyToDbId.set(epic.jiraId, created.id)
  }

  for (const { child, epicJiraId } of resolution.resolvedChildren) {
    const epicDbId = epicJiraId ? epicPkeyToDbId.get(epicJiraId) ?? null : null

    const existingStory = await prisma.userStory.findFirst({
      where: { title: child.pkey },
    })

    if (existingStory) {
      if (options.onConflict === 'overwrite') {
        await prisma.userStory.update({
          where: { id: existingStory.id },
          data: {
            title: child.title,
            status: child.status as 'backlog' | 'active' | 'done',
            epicId: epicDbId,
          },
        })
      }
      if (epicDbId) {
        storiesLinked++
      } else {
        storiesUnlinked++
      }
      continue
    }

    await prisma.userStory.create({
      data: {
        id:        randomUUID(),
        projectId: options.projectId,
        title:     child.title,
        status:    child.status as 'backlog' | 'active' | 'done',
        epicId:    epicDbId,
        featureId: null,
      },
    })

    if (epicDbId) {
      storiesLinked++
    } else {
      storiesUnlinked++
    }
  }

  return {
    epicsCreated,
    epicsSkipped,
    storiesLinked,
    storiesUnlinked,
    unmatchedEpicLinks: resolution.unmatchedEpicLinks,
  }
}
