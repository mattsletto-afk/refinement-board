import type { Epic, Feature, Story, Task } from '@/app/generated/prisma'

export interface CsvExportData {
  projectKey: string
  epics: (Epic & { features: (Feature & { stories: (Story & { tasks: Task[] })[] })[] })[]
  orphanStories: (Story & { tasks: Task[] })[]
}

const CSV_HEADERS = [
  'Issue Key',
  'Summary',
  'Issue Type',
  'Status',
  'Priority',
  'Epic Link',
  'Story Points',
  'Assignee',
  'Reporter',
  'Created',
  'Updated',
  'Labels',
]

function csvCell(value: string | null | undefined): string {
  const s = value ?? ''
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function csvRow(cells: (string | null | undefined)[]): string {
  return cells.map(csvCell).join(',')
}

function isoDate(d: Date | null | undefined): string {
  if (!d) return ''
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString()
}

function storyRow(
  story: Story & { tasks?: Task[] },
  issueNum: number,
  projectKey: string,
  issuetype: string,
  epicKey: string | null,
): string {
  const r = story as unknown as Record<string, unknown>
  return csvRow([
    `${projectKey}-${issueNum}`,
    story.title,
    issuetype,
    story.status,
    (r['priority'] as string) ?? 'medium',
    epicKey ?? '',
    String(r['estimate'] ?? ''),
    (r['assignee'] as string) ?? '',
    (r['reporter'] as string) ?? '',
    isoDate(r['createdAt'] as Date),
    isoDate(r['updatedAt'] as Date),
    ((r['tags'] as string[]) ?? []).join(' '),
  ])
}

function epicRow(epic: Epic, epicNum: number, projectKey: string): string {
  const r = epic as unknown as Record<string, unknown>
  return csvRow([
    `${projectKey}-${epicNum}`,
    epic.title,
    'Epic',
    epic.status,
    (r['priority'] as string) ?? 'medium',
    '',
    '',
    '',
    '',
    isoDate(r['createdAt'] as Date),
    isoDate(r['updatedAt'] as Date),
    '',
  ])
}

export function serializeProjectAsCsv(data: CsvExportData): string {
  const { projectKey, epics, orphanStories } = data
  const rows: string[] = [csvRow(CSV_HEADERS)]
  let num = 1

  for (const epic of epics) {
    const epicKey = `${projectKey}-${num}`
    rows.push(epicRow(epic, num, projectKey))
    num++

    for (const feature of epic.features) {
      for (const story of feature.stories) {
        rows.push(storyRow(story, num, projectKey, 'Story', epicKey))
        num++
      }
    }
    const epicStories = ((epic as unknown as Record<string, unknown>)['stories'] as (Story & { tasks: Task[] })[] | undefined) ?? []
    for (const story of epicStories) {
      rows.push(storyRow(story, num, projectKey, 'Story', epicKey))
      num++
    }
  }

  for (const story of orphanStories) {
    rows.push(storyRow(story, num, projectKey, 'Story', null))
    num++
  }

  return rows.join('\n')
}
