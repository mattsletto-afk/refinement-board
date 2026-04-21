import type { ProjectFormatAdapter, ImportDTO, ImportedStory, ImportedEpic, ImportedSprint } from './ProjectFormatAdapter'

interface GitHubLabel { name?: string }
interface GitHubUser { login?: string }
interface GitHubMilestone {
  id?: number
  number?: number
  title?: string
  description?: string | null
  state?: 'open' | 'closed'
  due_on?: string | null
}
interface GitHubIssue {
  id?: number
  number?: number
  title?: string
  body?: string | null
  state?: 'open' | 'closed'
  labels?: GitHubLabel[]
  assignees?: GitHubUser[]
  milestone?: GitHubMilestone | null
  created_at?: string
  updated_at?: string
  pull_request?: unknown
}
interface GitHubProjectItem {
  content?: { number?: number }
  fieldValues?: { nodes?: Array<{ field?: { name?: string }; text?: string; name?: string; date?: string; number?: number }> }
}
interface GitHubProjectV2 {
  title?: string
  shortDescription?: string | null
  items?: { nodes?: GitHubProjectItem[] }
}
interface GitHubExport {
  repository?: { name?: string; description?: string | null }
  issues?: GitHubIssue[]
  milestones?: GitHubMilestone[]
  projects?: GitHubProjectV2[]
}

function mapGitHubState(issue: GitHubIssue): 'backlog' | 'active' | 'done' {
  if (issue.state === 'closed') return 'done'
  const labels = issue.labels?.map(l => (l.name ?? '').toLowerCase()) ?? []
  if (labels.some(l => l.includes('in progress') || l === 'wip')) return 'active'
  return 'backlog'
}

function mapGitHubPriority(issue: GitHubIssue): 'low' | 'medium' | 'high' | 'critical' {
  const labels = issue.labels?.map(l => (l.name ?? '').toLowerCase()) ?? []
  if (labels.some(l => l.includes('critical') || l.includes('p0'))) return 'critical'
  if (labels.some(l => l.includes('high') || l.includes('p1'))) return 'high'
  if (labels.some(l => l.includes('low') || l.includes('p3'))) return 'low'
  return 'medium'
}

export class GitHubImportAdapter implements ProjectFormatAdapter {
  readonly formatName = 'GitHub Projects'
  readonly fileExtensions = ['.json']

  async parse(fileContent: string | Buffer): Promise<ImportDTO> {
    const text = typeof fileContent === 'string' ? fileContent : fileContent.toString('utf8')
    let data: GitHubExport
    try {
      data = JSON.parse(text) as GitHubExport
    } catch {
      return {
        projectName: 'GitHub Import',
        projectDescription: null,
        epics: [],
        stories: [],
        sprints: [],
        parseErrors: [{ entity: 'root', id: null, message: 'Invalid JSON' }],
      }
    }

    const parseErrors: ImportDTO['parseErrors'] = []
    const rawIssues = (data.issues ?? []).filter(i => !i.pull_request)
    const milestones = data.milestones ?? rawIssues.flatMap(i => i.milestone ? [i.milestone] : [])
    const uniqueMilestones = Array.from(new Map(milestones.map(m => [m.number ?? m.id, m])).values())

    const epicLabels = new Set(['epic', 'epic-story', 'theme'])
    const epicIssues = rawIssues.filter(i =>
      i.labels?.some(l => epicLabels.has((l.name ?? '').toLowerCase()))
    )
    const epicNumbers = new Set(epicIssues.map(i => i.number))

    const epics: ImportedEpic[] = epicIssues.map(i => ({
      externalId: String(i.number ?? i.id ?? ''),
      title: i.title ?? '',
      description: i.body ?? null,
      status: mapGitHubState(i),
    }))

    const stories: ImportedStory[] = rawIssues
      .filter(i => !epicNumbers.has(i.number))
      .map(i => {
        const epicLabel = i.labels?.find(l => (l.name ?? '').match(/^epic:/i))
        const epicTitle = epicLabel ? epicLabel.name?.replace(/^epic:\s*/i, '') ?? null : null
        return {
          externalId: String(i.number ?? i.id ?? ''),
          title: i.title ?? '',
          description: i.body ?? null,
          status: mapGitHubState(i),
          priority: mapGitHubPriority(i),
          storyPoints: null,
          epicTitle,
          assignee: i.assignees?.[0]?.login ?? null,
          labels: i.labels?.map(l => l.name ?? '').filter(Boolean) ?? [],
        }
      })

    const issueNumberToExternalId = new Map(rawIssues.map(i => [i.number, String(i.number ?? i.id ?? '')]))

    const sprints: ImportedSprint[] = uniqueMilestones.map(m => {
      const milestoneIssues = rawIssues
        .filter(i => i.milestone?.number === m.number || i.milestone?.id === m.id)
        .map(i => issueNumberToExternalId.get(i.number) ?? '')
        .filter(Boolean)
      return {
        externalId: String(m.number ?? m.id ?? ''),
        name: m.title ?? `Milestone ${m.number ?? m.id}`,
        state: m.state === 'closed' ? 'closed' : (m.due_on && new Date(m.due_on) < new Date() ? 'closed' : 'future'),
        startDate: null,
        endDate: m.due_on ? new Date(m.due_on) : null,
        storyIds: milestoneIssues,
      }
    })

    const projectName = data.projects?.[0]?.title
      ?? data.repository?.name
      ?? 'GitHub Import'

    return {
      projectName,
      projectDescription: data.projects?.[0]?.shortDescription ?? data.repository?.description ?? null,
      epics,
      stories,
      sprints,
      parseErrors,
    }
  }
}
