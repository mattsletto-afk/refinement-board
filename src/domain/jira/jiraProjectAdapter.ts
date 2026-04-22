import type {
  JiraProject,
  JiraComponent,
  JiraProjectVersion,
  MappedProject,
  MappedWorkstream,
  MappedMilestone,
  JiraProjectAdapterResult,
} from '@/src/domain/jira/types'

function mapProject(project: JiraProject): MappedProject {
  return {
    jiraId: project.id,
    pkey: project.pkey,
    name: project.pname,
    description: project.description ?? null,
    lead: project.lead ?? null,
    url: project.url ?? null,
    projectType: project.projecttype,
  }
}

function mapComponent(component: JiraComponent): MappedWorkstream {
  return {
    jiraComponentId: component.id,
    jiraProjectId: component.project,
    name: component.name,
    description: component.description ?? null,
    lead: component.lead ?? null,
  }
}

function resolveVersionStatus(
  version: JiraProjectVersion,
): 'upcoming' | 'completed' | 'archived' {
  if (version.archived) return 'archived'
  if (version.released) return 'completed'
  return 'upcoming'
}

function parseOptionalDate(value: string | null): Date | null {
  if (value === null) return null
  const parsed = new Date(value)
  return isNaN(parsed.getTime()) ? null : parsed
}

function mapVersion(version: JiraProjectVersion): MappedMilestone {
  return {
    jiraVersionId: version.id,
    jiraProjectId: version.project,
    name: version.vname,
    description: version.description ?? null,
    status: resolveVersionStatus(version),
    releaseDate: parseOptionalDate(version.releasedate),
    startDate: parseOptionalDate(version.startdate),
    sequence: version.sequence,
  }
}

export function adaptJiraProject(
  project: JiraProject,
  components: JiraComponent[],
  versions: JiraProjectVersion[],
): JiraProjectAdapterResult {
  const projectComponents = components.filter(
    (c) => c.project === project.id,
  )
  const projectVersions = versions.filter(
    (v) => v.project === project.id,
  )

  return {
    project: mapProject(project),
    workstreams: projectComponents.map(mapComponent),
    milestones: projectVersions
      .sort((a, b) => a.sequence - b.sequence)
      .map(mapVersion),
  }
}

export function adaptJiraProjects(
  projects: JiraProject[],
  components: JiraComponent[],
  versions: JiraProjectVersion[],
): JiraProjectAdapterResult[] {
  return projects.map((project) =>
    adaptJiraProject(project, components, versions),
  )
}
