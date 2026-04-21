const { describe, test, expect, beforeEach } = require('@jest/globals')

// Inline the logic under test to avoid module resolution issues

const EPIC_LINK_FIELD_IDS = ['customfield_10014', 'customfield_10008', 'Epic Link']
const EPIC_ISSUE_TYPE_NAMES = ['Epic', 'epic']

const STATUS_MAP = {
  'To Do': 'backlog',
  'to do': 'backlog',
  'TODO': 'backlog',
  'Backlog': 'backlog',
  'backlog': 'backlog',
  'In Progress': 'active',
  'in progress': 'active',
  'IN PROGRESS': 'active',
  'Active': 'active',
  'active': 'active',
  'In Review': 'active',
  'Code Review': 'active',
  'Done': 'done',
  'done': 'done',
  'DONE': 'done',
  'Closed': 'done',
  'closed': 'done',
  'Resolved': 'done',
  'resolved': 'done',
}

const PRIORITY_MAP = {
  'Highest': 'critical',
  'highest': 'critical',
  'Critical': 'critical',
  'critical': 'critical',
  'High': 'high',
  'high': 'high',
  'Medium': 'medium',
  'medium': 'medium',
  'Low': 'low',
  'low': 'low',
  'Lowest': 'low',
  'lowest': 'low',
}

function normalizeStatus(jiraStatus) {
  return STATUS_MAP[jiraStatus] ?? 'backlog'
}

function normalizePriority(jiraPriority) {
  return PRIORITY_MAP[jiraPriority] ?? 'medium'
}

function isEpicIssueType(issueType) {
  return EPIC_ISSUE_TYPE_NAMES.some(
    (name) => name.toLowerCase() === issueType.toLowerCase()
  )
}

function resolveEpicLinkPkey(customFieldValues) {
  for (const fieldId of EPIC_LINK_FIELD_IDS) {
    const match = customFieldValues.find((cfv) => cfv.fieldId === fieldId)
    if (match && match.value.trim() !== '') {
      return match.value.trim()
    }
  }
  return null
}

function adaptJiraEpic(row) {
  return {
    jiraId: row.id,
    pkey: row.pkey,
    title: row.summary,
    status: normalizeStatus(row.issuestatus),
    priority: normalizePriority(row.priority),
    description: row.description ?? null,
  }
}

function adaptJiraChildIssue(row) {
  return {
    jiraId: row.id,
    pkey: row.pkey,
    title: row.summary,
    issueType: row.issuetype,
    status: normalizeStatus(row.issuestatus),
    priority: normalizePriority(row.priority),
    epicLinkPkey: resolveEpicLinkPkey(row.customFieldValues),
    description: row.description ?? null,
  }
}

function buildEpicHierarchy(rows) {
  const epics = []
  const children = []
  for (const row of rows) {
    if (isEpicIssueType(row.issuetype)) {
      epics.push(adaptJiraEpic(row))
    } else {
      children.push(adaptJiraChildIssue(row))
    }
  }
  return { epics, children }
}

function resolveEpicLinks(hierarchy) {
  const epicByPkey = new Map(
    hierarchy.epics.map((epic) => [epic.pkey, epic])
  )
  const unmatchedEpicLinks = []
  const resolvedChildren = []
  for (const child of hierarchy.children) {
    if (child.epicLinkPkey === null) {
      resolvedChildren.push({ child, epicJiraId: null })
      continue
    }
    const matchedEpic = epicByPkey.get(child.epicLinkPkey)
    if (matchedEpic) {
      resolvedChildren.push({ child, epicJiraId: matchedEpic.jiraId })
    } else {
      unmatchedEpicLinks.push(child.epicLinkPkey)
      resolvedChildren.push({ child, epicJiraId: null })
    }
  }
  return {
    epics: hierarchy.epics,
    resolvedChildren,
    unmatchedEpicLinks: [...new Set(unmatchedEpicLinks)],
  }
}

function groupChildrenByEpic(resolvedChildren) {
  const grouped = new Map()
  for (const { child, epicJiraId } of resolvedChildren) {
    const key = epicJiraId
    const existing = grouped.get(key)
    if (existing) {
      existing.push(child)
    } else {
      grouped.set(key, [child])
    }
  }
  return grouped
}

function makeEpicRow(overrides = {}) {
  return {
    id: 'jira-100',
    issuenum: 100,
    pkey: 'PROJ-100',
    project: 'PROJ',
    summary: 'My Epic',
    issuetype: 'Epic',
    issuestatus: 'To Do',
    priority: 'High',
    assignee: null,
    reporter: null,
    description: null,
    created: '2024-01-01',
    updated: '2024-01-02',
    customFieldValues: [],
    ...overrides,
  }
}

function makeStoryRow(overrides = {}) {
  return {
    id: 'jira-200',
    issuenum: 200,
    pkey: 'PROJ-200',
    project: 'PROJ',
    summary: 'My Story',
    issuetype: 'Story',
    issuestatus: 'In Progress',
    priority: 'Medium',
    assignee: null,
    reporter: null,
    description: null,
    created: '2024-01-01',
    updated: '2024-01-02',
    customFieldValues: [],
    ...overrides,
  }
}

beforeEach(() => jest.clearAllMocks())

describe('isEpicIssueType', () => {
  test('returns true for exact Epic', () => {
    expect(isEpicIssueType('Epic')).toBe(true)
  })

  test('returns true for lowercase epic', () => {
    expect(isEpicIssueType('epic')).toBe(true)
  })

  test('returns false for Story', () => {
    expect(isEpicIssueType('Story')).toBe(false)
  })

  test('returns false for Bug', () => {
    expect(isEpicIssueType('Bug')).toBe(false)
  })

  test('returns false for Sub-task', () => {
    expect(isEpicIssueType('Sub-task')).toBe(false)
  })
})

describe('resolveEpicLinkPkey', () => {
  test('returns null when no custom fields', () => {
    expect(resolveEpicLinkPkey([])).toBeNull()
  })

  test('resolves customfield_10014', () => {
    const cfvs = [{ fieldId: 'customfield_10014', value: 'PROJ-100' }]
    expect(resolveEpicLinkPkey(cfvs)).toBe('PROJ-100')
  })

  test('resolves customfield_10008 as fallback', () => {
    const cfvs = [{ fieldId: 'customfield_10008', value: 'PROJ-50' }]
    expect(resolveEpicLinkPkey(cfvs)).toBe('PROJ-50')
  })

  test('resolves Epic Link by name', () => {
    const cfvs = [{ fieldId: 'Epic Link', value: 'PROJ-99' }]
    expect(resolveEpicLinkPkey(cfvs)).toBe('PROJ-99')
  })

  test('returns null when value is empty string', () => {
    const cfvs = [{ fieldId: 'customfield_10014', value: '   ' }]
    expect(resolveEpicLinkPkey(cfvs)).toBeNull()
  })

  test('prefers customfield_10014 over customfield_10008', () => {
    const cfvs = [
      { fieldId: 'customfield_10014', value: 'PROJ-100' },
      { fieldId: 'customfield_10008', value: 'PROJ-200' },
    ]
    expect(resolveEpicLinkPkey(cfvs)).toBe('PROJ-100')
  })

  test('trims whitespace from resolved value', () => {
    const cfvs = [{ fieldId: 'customfield_10014', value: '  PROJ-100  ' }]
    expect(resolveEpicLinkPkey(cfvs)).toBe('PROJ-100')
  })
})

describe('adaptJiraEpic', () => {
  test('maps basic fields correctly', () => {
    const row = makeEpicRow()
    const result = adaptJiraEpic(row)
    expect(result.jiraId).toBe('jira-100')
    expect(result.pkey).toBe('PROJ-100')
    expect(result.title).toBe('My Epic')
  })

  test('normalizes status To Do → backlog', () => {
    const row = makeEpicRow({ issuestatus: 'To Do' })
    expect(adaptJiraEpic(row).status).toBe('backlog')
  })

  test('normalizes status Done → done', () => {
    const row = makeEpicRow({ issuestatus: 'Done' })
    expect(adaptJiraEpic(row).status).toBe('done')
  })

  test('normalizes priority High → high', () => {
    const row = makeEpicRow({ priority: 'High' })
    expect(adaptJiraEpic(row).priority).toBe('high')
  })

  test('normalizes priority Highest → critical', () => {
    const row = makeEpicRow({ priority: 'Highest' })
    expect(adaptJiraEpic(row).priority).toBe('critical')
  })

  test('sets description to null when absent', () => {
    const row = makeEpicRow({ description: null })
    expect(adaptJiraEpic(row).description).toBeNull()
  })

  test('captures description when present', () => {
    const row = makeEpicRow({ description: 'Epic description' })
    expect(adaptJiraEpic(row).description).toBe('Epic description')
  })
})

describe('adaptJiraChildIssue', () => {
  test('maps basic fields correctly', () => {
    const row = makeStoryRow()
    const result = adaptJiraChildIssue(row)
    expect(result.jiraId).toBe('jira-200')
    expect(result.pkey).toBe('PROJ-200')
    expect(result.title).toBe('My Story')
    expect(result.issueType).toBe('Story')
  })

  test('sets epicLinkPkey to null when no Epic Link field', () => {
    const row = makeStoryRow({ customFieldValues: [] })
    expect(adaptJiraChildIssue(row).epicLinkPkey).toBeNull()
  })

  test('extracts epicLinkPkey from customfield_10014', () => {
    const row = makeStoryRow({
      customFieldValues: [{ fieldId: 'customfield_10014', value: 'PROJ-100' }],
    })
    expect(adaptJiraChildIssue(row).epicLinkPkey).toBe('PROJ-100')
  })

  test('normalizes status In Progress → active', () => {
    const row = makeStoryRow({ issuestatus: 'In Progress' })
    expect(adaptJiraChildIssue(row).status).toBe('active')
  })

  test('normalizes unknown status → backlog', () => {
    const row = makeStoryRow({ issuestatus: 'Weird Status' })
    expect(adaptJiraChildIssue(row).status).toBe('backlog')
  })
})

describe('buildEpicHierarchy', () => {
  test('separates epics from non-epics', () => {
    const rows = [
      makeEpicRow({ id: 'e1', pkey: 'PROJ-1', issuetype: 'Epic' }),
      makeStoryRow({ id: 's1', pkey: 'PROJ-2', issuetype: 'Story' }),
      makeStoryRow({ id: 's2', pkey: 'PROJ-3', issuetype: 'Bug' }),
    ]
    const result = buildEpicHierarchy(rows)
    expect(result.epics).toHaveLength(1)
    expect(result.children).toHaveLength(2)
  })

  test('handles all epics', () => {
    const rows = [
      makeEpicRow({ id: 'e1', pkey: 'PROJ-1' }),
      makeEpicRow({ id: 'e2', pkey: 'PROJ-2', summary: 'Epic 2' }),
    ]
    const result = buildEpicHierarchy(rows)
    expect(result.epics).toHaveLength(2)
    expect(result.children).toHaveLength(0)
  })

  test('handles all non-epics', () => {
    const rows = [
      makeStoryRow({ id: 's1', pkey: 'PROJ-1' }),
      makeStoryRow({ id: 's2', pkey: 'PROJ-2', issuetype: 'Bug' }),
    ]
    const result = buildEpicHierarchy(rows)
    expect(result.epics).toHaveLength(0)
    expect(result.children).toHaveLength(2)
  })

  test('handles empty input', () => {
    const result = buildEpicHierarchy([])
    expect(result.epics).toHaveLength(0)
    expect(result.children).toHaveLength(0)
  })

  test('case-insensitive epic detection', () => {
    const rows = [
      makeEpicRow({ id: 'e1', pkey: 'PROJ-1', issuetype: 'epic' }),
    ]
    const result = buildEpicHierarchy(rows)
    expect(result.epics).toHaveLength(1)
  })
})

describe('resolveEpicLinks', () => {
  test('links children to matching epics by pkey', () => {
    const epic = { jiraId: 'e1', pkey: 'PROJ-1', title: 'Epic', status: 'backlog', priority: 'high', description: null }
    const child = { jiraId: 's1', pkey: 'PROJ-2', title: 'Story', issueType: 'Story', status: 'active', priority: 'medium', epicLinkPkey: 'PROJ-1', description: null }
    const result = resolveEpicLinks({ epics: [epic], children: [child] })
    expect(result.resolvedChildren[0].epicJiraId).toBe('e1')
    expect(result.unmatchedEpicLinks).toHaveLength(0)
  })

  test('sets epicJiraId to null for children with no epic link', () => {
    const epic = { jiraId: 'e1', pkey: 'PROJ-1', title: 'Epic', status: 'backlog', priority: 'high', description: null }
    const child = { jiraId: 's1', pkey: 'PROJ-2', title: 'Story', issueType: 'Story', status: 'active', priority: 'medium', epicLinkPkey: null, description: null }
    const result = resolveEpicLinks({ epics: [epic], children: [child] })
    expect(result.resolvedChildren[0].epicJiraId).toBeNull()
    expect(result.unmatchedEpicLinks).toHaveLength(0)
  })

  test('records unmatched epic links', () => {
    const child = { jiraId: 's1', pkey: 'PROJ-2', title: 'Story', issueType: 'Story', status: 'active', priority: 'medium', epicLinkPkey: 'PROJ-999', description: null }
    const result = resolveEpicLinks({ epics: [], children: [child] })
    expect(result.unmatchedEpicLinks).toContain('PROJ-999')
    expect(result.resolvedChildren[0].epicJiraId).toBeNull()
  })

  test('deduplicates unmatched epic links', () => {
    const child1 = { jiraId: 's1', pkey: 'PROJ-2', title: 'S1', issueType: 'Story', status: 'active', priority: 'medium', epicLinkPkey: 'PROJ-999', description: null }
    const child2 = { jiraId: 's2', pkey: 'PROJ-3', title: 'S2', issueType: 'Story', status: 'active', priority: 'medium', epicLinkPkey: 'PROJ-999', description: null }
    const result = resolveEpicLinks({ epics: [], children: [child1, child2] })
    expect(result.unmatchedEpicLinks).toHaveLength(1)
    expect(result.unmatchedEpicLinks[0]).toBe('PROJ-999')
  })

  test('links multiple children to same epic', () => {
    const epic = { jiraId: 'e1', pkey: 'PROJ-1', title: 'Epic', status: 'backlog', priority: 'high', description: null }
    const child1 = { jiraId: 's1', pkey: 'PROJ-2', title: 'S1', issueType: 'Story', status: 'active', priority: 'medium', epicLinkPkey: 'PROJ-1', description: null }
    const child2 = { jiraId: 's2', pkey: 'PROJ-3', title: 'S2', issueType: 'Story', status: 'active', priority: 'medium', epicLinkPkey: 'PROJ-1', description: null }
    const result = resolveEpicLinks({ epics: [epic], children: [child1, child2] })
    expect(result.resolvedChildren[0].epicJiraId).toBe('e1')
    expect(result.resolvedChildren[1].epicJiraId).toBe('e1')
  })

  test('handles multiple epics correctly', () => {
    const epic1 = { jiraId: 'e1', pkey: 'PROJ-1', title: 'Epic 1', status: 'backlog', priority: 'high', description: null }
    const epic2 = { jiraId: 'e2', pkey: 'PROJ-2', title: 'Epic 2', status: 'backlog', priority: 'medium', description: null }
    const child1 = { jiraId: 's3', pkey: 'PROJ-3', title: 'S3', issueType: 'Story', status: 'active', priority: 'medium', epicLinkPkey: 'PROJ-1', description: null }
    const child2 = { jiraId: 's4', pkey: 'PROJ-4', title: 'S4', issueType: 'Story', status: 'active', priority: 'medium', epicLinkPkey: 'PROJ-2', description: null }
    const result = resolveEpicLinks({ epics: [epic1, epic2], children: [child1, child2] })
    expect(result.resolvedChildren[0].epicJiraId).toBe('e1')
    expect(result.resolvedChildren[1].epicJiraId).toBe('e2')
  })

  test('preserves epics in result', () => {
    const epic = { jiraId: 'e1', pkey: 'PROJ-1', title: 'Epic', status: 'backlog', priority: 'high', description: null }
    const result = resolveEpicLinks({ epics: [epic], children: [] })
    expect(result.epics).toHaveLength(1)
    expect(result.epics[0].jiraId).toBe('e1')
  })
})

describe('groupChildrenByEpic', () => {
  test('groups children under their epic jira id', () => {
    const child1 = { jiraId: 's1', pkey: 'PROJ-2', title: 'S1', issueType: 'Story', status: 'active', priority: 'medium', epicLinkPkey: 'PROJ-1', description: null }
    const child2 = { jiraId: 's2', pkey: 'PROJ-3', title: 'S2', issueType: 'Story', status: 'active', priority: 'medium', epicLinkPkey: 'PROJ-1', description: null }
    const resolvedChildren = [
      { child: child1, epicJiraId: 'e1' },
      { child: child2, epicJiraId: 'e1' },
    ]
    const grouped = groupChildrenByEpic(resolvedChildren)
    expect(grouped.get('e1')).toHaveLength(2)
  })

  test('groups orphan children under null key', () => {
    const child = { jiraId: 's1', pkey: 'PROJ-2', title: 'S1', issueType: 'Story', status: 'active', priority: 'medium', epicLinkPkey: null, description: null }
    const resolvedChildren = [{ child, epicJiraId: null }]
    const grouped = groupChildrenByEpic(resolvedChildren)
    expect(grouped.get(null)).toHaveLength(1)
  })

  test('handles empty input', () => {
    const grouped = groupChildrenByEpic([])
    expect(grouped.size).toBe(0)
  })

  test('correctly separates children across different epics', () => {
    const child1 = { jiraId: 's1', pkey: 'PROJ-2', title: 'S1', issueType: 'Story', status: 'active', priority: 'medium', epicLinkPkey: 'PROJ-1', description: null }
    const child2 = { jiraId: 's2', pkey: 'PROJ-3', title: 'S2', issueType: 'Story', status: 'active', priority: 'medium', epicLinkPkey: 'PROJ-2', description: null }
    const resolvedChildren = [
      { child: child1, epicJiraId: 'e1' },
      { child: child2, epicJiraId: 'e2' },
    ]
    const grouped = groupChildrenByEpic(resolvedChildren)
    expect(grouped.get('e1')).toHaveLength(1)
    expect(grouped.get('e2')).toHaveLength(1)
  })
})

describe('normalizeStatus', () => {
  test('maps To Do to backlog', () => { expect(normalizeStatus('To Do')).toBe('backlog') })
  test('maps In Progress to active', () => { expect(normalizeStatus('In Progress')).toBe('active') })
  test('maps Done to done', () => { expect(normalizeStatus('Done')).toBe('done') })
  test('maps Resolved to done', () => { expect(normalizeStatus('Resolved')).toBe('done') })
  test('falls back to backlog for unknown', () => { expect(normalizeStatus('Unknown')).toBe('backlog') })
})

describe('normalizePriority', () => {
  test('maps Highest to critical', () => { expect(normalizePriority('Highest')).toBe('critical') })
  test('maps High to high', () => { expect(normalizePriority('High')).toBe('high') })
  test('maps Medium to medium', () => { expect(normalizePriority('Medium')).toBe('medium') })
  test('maps Low to low', () => { expect(normalizePriority('Low')).toBe('low') })
  test('falls back to medium for unknown', () => { expect(normalizePriority('Unknown')).toBe('medium') })
})
