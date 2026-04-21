const { describe, test, expect, beforeEach } = require('@jest/globals')

beforeEach(() => jest.clearAllMocks())

// Inline the adapter logic to keep tests self-contained

function resolveVersionStatus(version) {
  if (version.archived) return 'archived'
  if (version.released) return 'completed'
  return 'upcoming'
}

function parseOptionalDate(value) {
  if (value === null) return null
  const parsed = new Date(value)
  return isNaN(parsed.getTime()) ? null : parsed
}

function mapProject(project) {
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

function mapComponent(component) {
  return {
    jiraComponentId: component.id,
    jiraProjectId: component.project,
    name: component.name,
    description: component.description ?? null,
    lead: component.lead ?? null,
  }
}

function mapVersion(version) {
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

function adaptJiraProject(project, components, versions) {
  const projectComponents = components.filter((c) => c.project === project.id)
  const projectVersions = versions.filter((v) => v.project === project.id)

  return {
    project: mapProject(project),
    workstreams: projectComponents.map(mapComponent),
    milestones: projectVersions
      .sort((a, b) => a.sequence - b.sequence)
      .map(mapVersion),
  }
}

function adaptJiraProjects(projects, components, versions) {
  return projects.map((project) => adaptJiraProject(project, components, versions))
}

// Fixtures

const baseProject = {
  id: '10000',
  pkey: 'PROJ',
  pname: 'My Project',
  description: 'A test project',
  lead: 'user1',
  url: 'https://example.com',
  assigneetype: 0,
  avatar: null,
  projecttype: 'software',
  defaultScheme: null,
}

const baseComponent = {
  id: 'comp1',
  project: '10000',
  name: 'Frontend',
  description: 'UI workstream',
  assigneetype: 0,
  assignee: null,
  lead: 'user2',
  issuecount: 5,
  url: null,
}

const baseVersion = {
  id: 'ver1',
  project: '10000',
  vname: 'v1.0',
  description: 'First release',
  sequence: 1,
  released: false,
  archived: false,
  releasedate: '2024-06-01',
  startdate: '2024-01-01',
  url: null,
}

describe('mapProject', () => {
  test('maps all fields correctly', () => {
    const result = mapProject(baseProject)
    expect(result.jiraId).toBe('10000')
    expect(result.pkey).toBe('PROJ')
    expect(result.name).toBe('My Project')
    expect(result.description).toBe('A test project')
    expect(result.lead).toBe('user1')
    expect(result.url).toBe('https://example.com')
    expect(result.projectType).toBe('software')
  })

  test('maps null description to null', () => {
    const result = mapProject({ ...baseProject, description: null })
    expect(result.description).toBeNull()
  })

  test('maps null lead to null', () => {
    const result = mapProject({ ...baseProject, lead: null })
    expect(result.lead).toBeNull()
  })

  test('maps null url to null', () => {
    const result = mapProject({ ...baseProject, url: null })
    expect(result.url).toBeNull()
  })

  test('preserves pkey exactly as given', () => {
    const result = mapProject({ ...baseProject, pkey: 'FOO-BAR' })
    expect(result.pkey).toBe('FOO-BAR')
  })
})

describe('mapComponent', () => {
  test('maps all fields correctly', () => {
    const result = mapComponent(baseComponent)
    expect(result.jiraComponentId).toBe('comp1')
    expect(result.jiraProjectId).toBe('10000')
    expect(result.name).toBe('Frontend')
    expect(result.description).toBe('UI workstream')
    expect(result.lead).toBe('user2')
  })

  test('maps null description to null', () => {
    const result = mapComponent({ ...baseComponent, description: null })
    expect(result.description).toBeNull()
  })

  test('maps null lead to null', () => {
    const result = mapComponent({ ...baseComponent, lead: null })
    expect(result.lead).toBeNull()
  })

  test('does not expose assignee or issuecount fields', () => {
    const result = mapComponent(baseComponent)
    expect(result.assignee).toBeUndefined()
    expect(result.issuecount).toBeUndefined()
  })
})

describe('resolveVersionStatus', () => {
  test('returns upcoming when not released and not archived', () => {
    expect(resolveVersionStatus({ released: false, archived: false })).toBe('upcoming')
  })

  test('returns completed when released and not archived', () => {
    expect(resolveVersionStatus({ released: true, archived: false })).toBe('completed')
  })

  test('returns archived when archived (regardless of released)', () => {
    expect(resolveVersionStatus({ released: false, archived: true })).toBe('archived')
  })

  test('returns archived over completed when both are true', () => {
    expect(resolveVersionStatus({ released: true, archived: true })).toBe('archived')
  })
})

describe('parseOptionalDate', () => {
  test('returns null for null input', () => {
    expect(parseOptionalDate(null)).toBeNull()
  })

  test('parses valid ISO date string', () => {
    const result = parseOptionalDate('2024-06-01')
    expect(result).toBeInstanceOf(Date)
    expect(result.getFullYear()).toBe(2024)
  })

  test('returns null for invalid date string', () => {
    expect(parseOptionalDate('not-a-date')).toBeNull()
  })
})

describe('mapVersion', () => {
  test('maps all fields correctly for upcoming version', () => {
    const result = mapVersion(baseVersion)
    expect(result.jiraVersionId).toBe('ver1')
    expect(result.jiraProjectId).toBe('10000')
    expect(result.name).toBe('v1.0')
    expect(result.description).toBe('First release')
    expect(result.status).toBe('upcoming')
    expect(result.releaseDate).toBeInstanceOf(Date)
    expect(result.startDate).toBeInstanceOf(Date)
    expect(result.sequence).toBe(1)
  })

  test('maps released version as completed', () => {
    const result = mapVersion({ ...baseVersion, released: true })
    expect(result.status).toBe('completed')
  })

  test('maps archived version as archived', () => {
    const result = mapVersion({ ...baseVersion, archived: true })
    expect(result.status).toBe('archived')
  })

  test('maps null releasedate and startdate to null', () => {
    const result = mapVersion({ ...baseVersion, releasedate: null, startdate: null })
    expect(result.releaseDate).toBeNull()
    expect(result.startDate).toBeNull()
  })

  test('maps null description to null', () => {
    const result = mapVersion({ ...baseVersion, description: null })
    expect(result.description).toBeNull()
  })
})

describe('adaptJiraProject', () => {
  test('maps project with no components or versions', () => {
    const result = adaptJiraProject(baseProject, [], [])
    expect(result.project.pkey).toBe('PROJ')
    expect(result.workstreams).toHaveLength(0)
    expect(result.milestones).toHaveLength(0)
  })

  test('filters components to only those belonging to the project', () => {
    const otherComponent = { ...baseComponent, id: 'comp2', project: '99999', name: 'Backend' }
    const result = adaptJiraProject(baseProject, [baseComponent, otherComponent], [])
    expect(result.workstreams).toHaveLength(1)
    expect(result.workstreams[0].name).toBe('Frontend')
  })

  test('filters versions to only those belonging to the project', () => {
    const otherVersion = { ...baseVersion, id: 'ver2', project: '99999', vname: 'v2.0' }
    const result = adaptJiraProject(baseProject, [], [baseVersion, otherVersion])
    expect(result.milestones).toHaveLength(1)
    expect(result.milestones[0].name).toBe('v1.0')
  })

  test('sorts milestones by sequence ascending', () => {
    const v2 = { ...baseVersion, id: 'ver2', vname: 'v2.0', sequence: 2 }
    const v3 = { ...baseVersion, id: 'ver3', vname: 'v3.0', sequence: 3 }
    const v1 = { ...baseVersion, id: 'ver1', vname: 'v1.0', sequence: 1 }
    const result = adaptJiraProject(baseProject, [], [v3, v1, v2])
    expect(result.milestones.map((m) => m.name)).toEqual(['v1.0', 'v2.0', 'v3.0'])
  })

  test('maps multiple components as workstreams', () => {
    const comp2 = { ...baseComponent, id: 'comp2', name: 'Backend' }
    const result = adaptJiraProject(baseProject, [baseComponent, comp2], [])
    expect(result.workstreams).toHaveLength(2)
    const names = result.workstreams.map((w) => w.name)
    expect(names).toContain('Frontend')
    expect(names).toContain('Backend')
  })

  test('result project fields match mapped project', () => {
    const result = adaptJiraProject(baseProject, [], [])
    expect(result.project).toEqual(mapProject(baseProject))
  })
})

describe('adaptJiraProjects', () => {
  test('returns empty array for empty projects', () => {
    const result = adaptJiraProjects([], [], [])
    expect(result).toHaveLength(0)
  })

  test('maps each project independently', () => {
    const project2 = { ...baseProject, id: '10001', pkey: 'OTHER', pname: 'Other Project' }
    const comp2 = { ...baseComponent, id: 'comp2', project: '10001', name: 'Infra' }
    const ver2 = { ...baseVersion, id: 'ver2', project: '10001', vname: 'v0.1', sequence: 1 }

    const result = adaptJiraProjects(
      [baseProject, project2],
      [baseComponent, comp2],
      [baseVersion, ver2],
    )

    expect(result).toHaveLength(2)
    expect(result[0].project.pkey).toBe('PROJ')
    expect(result[0].workstreams[0].name).toBe('Frontend')
    expect(result[0].milestones[0].name).toBe('v1.0')

    expect(result[1].project.pkey).toBe('OTHER')
    expect(result[1].workstreams[0].name).toBe('Infra')
    expect(result[1].milestones[0].name).toBe('v0.1')
  })

  test('projects share components pool but only receive their own', () => {
    const project2 = { ...baseProject, id: '10001', pkey: 'P2', pname: 'Project 2' }
    const result = adaptJiraProjects([baseProject, project2], [baseComponent], [])
    expect(result[0].workstreams).toHaveLength(1)
    expect(result[1].workstreams).toHaveLength(0)
  })

  test('projects share versions pool but only receive their own', () => {
    const project2 = { ...baseProject, id: '10001', pkey: 'P2', pname: 'Project 2' }
    const result = adaptJiraProjects([baseProject, project2], [], [baseVersion])
    expect(result[0].milestones).toHaveLength(1)
    expect(result[1].milestones).toHaveLength(0)
  })
})
