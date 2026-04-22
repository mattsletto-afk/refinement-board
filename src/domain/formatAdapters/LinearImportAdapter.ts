import type { ProjectFormatAdapter, ImportDTO, ImportedStory, ImportedEpic, ImportedSprint } from './ProjectFormatAdapter'

interface LinearIssue {
  id: string
  title: string
  description?: string
  state?: { name?: string; type?: string }
  priority?: number
  estimate?: number
  assignee?: { name?: string }
  labels?: { nodes?: Array<{ name?: string }> }
  cycle?: { id?: string; name?: string }
  team?: { key?: string }
  parent?: { id?: string; title?: string }
}

interface LinearCycle {
  id: string
  name: string
  number?: number
  startsAt?: string
  endsAt?: string
  completedAt?: string
  issues?: { nodes?: LinearIssue[] }
}

interface LinearProject {
  name?: string
  description?: string
}

interface LinearExport {
  organization?: { name?: string }
  project?: LinearProject
  issues?: { nodes?: LinearIssue[] }
  cycles?: { nodes?: LinearCycle[] }
}

const LINEAR_STATE_MAP: Record<string, 'backlog' | 'active' | 'done'> = {
  backlog: 'backlog',
  unstarted: 'backlog',
  started: 'active',
  inprogress: 'active',
  'in progress': 'active',
  completed: 'done',
  done: 'done',
  cancelled: 'done',
}

const LINEAR_PRIORITY_MAP: Record<number, 'low' | 'medium' | 'high' | 'critical'> = {
  0: 'medium',
  1: 'critical',
  2: 'high',
  3: 'medium',
  4: 'low',
}

function mapState(issue: LinearIssue): 'backlog' | 'active' | 'done' {
  const raw = (issue.state?.type ?? issue.state?.name ?? '').toLowerCase()
  return LINEAR_STATE_MAP[raw] ?? 'backlog'
}

function mapPriority(issue: LinearIssue): 'low' | 'medium' | 'high' | 'critical' {
  return LINEAR_PRIORITY_MAP[issue.priority ?? 0] ?? 'medium'
}

export class LinearImportAdapter implements ProjectFormatAdapter {
  readonly formatName = 'Linear'
  readonly fileExtensions = ['.json']

  async parse(fileContent: string | Buffer): Promise<ImportDTO> {
    const text = typeof fileContent === 'string' ? fileContent : fileContent.toString('utf8')
    let data: LinearExport
    try {
      data = JSON.parse(text) as LinearExport
    } catch {
      return {
        projectName: 'Linear Import',
        projectDescription: null,
        epics: [],
        stories: [],
        sprints: [],
        parseErrors: [{ entity: 'root', id: null, message: 'Invalid JSON' }],
      }
    }

    const parseErrors: ImportDTO['parseErrors'] = []
    const issues = data.issues?.nodes ?? []
    const cycles = data.cycles?.nodes ?? []

    const epicIds = new Set(
      issues
        .filter(i => issues.some(child => child.parent?.id === i.id))
        .map(i => i.id)
    )
    const parentTitles = new Map(issues.map(i => [i.id, i.title]))

    const epics: ImportedEpic[] = issues
      .filter(i => epicIds.has(i.id))
      .map(i => ({
        externalId: i.id,
        title: i.title,
        description: i.description ?? null,
        status: mapState(i),
      }))

    const stories: ImportedStory[] = issues
      .filter(i => !epicIds.has(i.id))
      .map(i => ({
        externalId: i.id,
        title: i.title,
        description: i.description ?? null,
        status: mapState(i),
        priority: mapPriority(i),
        storyPoints: i.estimate ?? null,
        epicTitle: i.parent?.id ? (parentTitles.get(i.parent.id) ?? null) : null,
        assignee: i.assignee?.name ?? null,
        labels: i.labels?.nodes?.map(l => l.name ?? '').filter(Boolean) ?? [],
      }))

    const sprints: ImportedSprint[] = cycles.map(c => ({
      externalId: c.id,
      name: c.name ?? `Cycle ${c.number ?? c.id}`,
      state: c.completedAt ? 'closed' : c.startsAt && new Date(c.startsAt) <= new Date() ? 'active' : 'future',
      startDate: c.startsAt ? new Date(c.startsAt) : null,
      endDate: c.endsAt ? new Date(c.endsAt) : null,
      storyIds: c.issues?.nodes?.map(i => i.id) ?? [],
    }))

    return {
      projectName: data.project?.name ?? data.organization?.name ?? 'Linear Import',
      projectDescription: data.project?.description ?? null,
      epics,
      stories,
      sprints,
      parseErrors,
    }
  }
}
