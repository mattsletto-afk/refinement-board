import type { Epic, Feature, Story, Task, Risk, Milestone } from '@/app/generated/prisma'

type StoryWithTasks = Story & { tasks: Task[] }
type FeatureWithStories = Feature & { stories: StoryWithTasks[] }
type EpicWithFeatures = Epic & {
  features: FeatureWithStories[]
  stories: StoryWithTasks[]
}

export interface ProjectExportData {
  projectName: string
  exportedAt: Date
  epics: EpicWithFeatures[]
  orphanStories: StoryWithTasks[]
  risks: Risk[]
  milestones: Milestone[]
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function statusBadge(status: string): string {
  return `\`${status}\``
}

function serializeTask(task: Task, indent = '  '): string {
  return `${indent}- [ ] ${task.title}`
}

function serializeStory(story: StoryWithTasks, level = 3): string {
  const heading = '#'.repeat(level)
  const lines: string[] = [
    `${heading} ${story.title}`,
    '',
    `**Status:** ${statusBadge(story.status)}`,
    '',
  ]

  if (story.tasks.length > 0) {
    lines.push('**Tasks:**', '')
    for (const task of story.tasks) {
      lines.push(serializeTask(task))
    }
    lines.push('')
  }

  return lines.join('\n')
}

function serializeFeature(feature: FeatureWithStories, level = 2): string {
  const heading = '#'.repeat(level)
  const lines: string[] = [
    `${heading} ${feature.title}`,
    '',
  ]

  for (const story of feature.stories) {
    lines.push(serializeStory(story, level + 1))
  }

  return lines.join('\n')
}

function serializeEpic(epic: EpicWithFeatures, level = 1): string {
  const heading = '#'.repeat(level + 1)
  const lines: string[] = [
    `${heading} Epic: ${epic.title}`,
    '',
    `**Status:** ${statusBadge(epic.status)}  **Priority:** ${statusBadge(epic.priority)}`,
    '',
  ]

  for (const feature of epic.features) {
    lines.push(serializeFeature(feature, level + 2))
  }

  for (const story of epic.stories) {
    lines.push(serializeStory(story, level + 2))
  }

  return lines.join('\n')
}

export function serializeToMarkdown(data: ProjectExportData): string {
  const lines: string[] = [
    `# ${data.projectName}`,
    '',
    `> Exported on ${formatDate(data.exportedAt)}`,
    '',
    '---',
    '',
  ]

  if (data.milestones.length > 0) {
    lines.push('## Milestones', '')
    for (const milestone of data.milestones) {
      lines.push(`- **${milestone.title}** — ${statusBadge(milestone.status)}`)
    }
    lines.push('')
  }

  if (data.epics.length > 0) {
    lines.push('## Epics & Features', '')
    for (const epic of data.epics) {
      lines.push(serializeEpic(epic))
    }
  }

  if (data.orphanStories.length > 0) {
    lines.push('## Stories (No Epic)', '')
    for (const story of data.orphanStories) {
      lines.push(serializeStory(story, 3))
    }
  }

  if (data.risks.length > 0) {
    lines.push('## Risks', '')
    for (const risk of data.risks) {
      lines.push(`- **${risk.title}** — ${statusBadge(risk.status)}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
