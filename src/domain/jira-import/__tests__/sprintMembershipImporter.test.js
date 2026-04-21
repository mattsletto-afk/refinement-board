const { describe, test, expect, beforeEach } = require('@jest/globals')

beforeEach(() => jest.clearAllMocks())

// Inline domain logic
const SPRINT_ENTITY = 'Sprint'
const ISSUE_ENTITY = 'Issue'
const ISSUE_IN_SPRINT_TYPE = 'IssueInSprint'

function filterSprintMembershipRows(rows) {
  return rows.filter(
    (row) =>
      row.associationType === ISSUE_IN_SPRINT_TYPE &&
      row.sourceNodeEntity === SPRINT_ENTITY &&
      row.sinkNodeEntity === ISSUE_ENTITY
  )
}

function buildIssueSprintIndex(rows) {
  const bySprintId = new Map()
  const byIssueId = new Map()
  const sprintRows = filterSprintMembershipRows(rows)
  for (const row of sprintRows) {
    const { sourceNodeId: sprintId, sinkNodeId: issueId } = row
    if (!bySprintId.has(sprintId)) bySprintId.set(sprintId, [])
    bySprintId.get(sprintId).push(issueId)
    if (!byIssueId.has(issueId)) byIssueId.set(issueId, [])
    byIssueId.get(issueId).push(sprintId)
  }
  return { bySprintId, byIssueId }
}

function getSprintMemberships(index) {
  return Array.from(index.bySprintId.entries()).map(([sprintId, issueIds]) => ({
    sprintId,
    issueIds: [...issueIds],
  }))
}

function importSprintMembership(rows) {
  const index = buildIssueSprintIndex(rows)
  const memberships = getSprintMemberships(index)
  const assignments = memberships.map((m) => ({
    jiraSprintId: m.sprintId,
    jiraIssueIds: m.issueIds,
  }))
  const totalAssociations = assignments.reduce((sum, a) => sum + a.jiraIssueIds.length, 0)
  const uniqueIssueIds = new Set(index.byIssueId.keys())
  return {
    assignments,
    totalAssociations,
    sprintCount: assignments.length,
    issueCount: uniqueIssueIds.size,
  }
}

function resolveSprintStoryIds(assignments, jiraIssueIdToStoryId, jiraSprintIdToSprintId) {
  const resolved = []
  for (const assignment of assignments) {
    const sprintId = jiraSprintIdToSprintId.get(assignment.jiraSprintId)
    if (!sprintId) continue
    for (const jiraIssueId of assignment.jiraIssueIds) {
      const storyId = jiraIssueIdToStoryId.get(jiraIssueId)
      if (!storyId) continue
      resolved.push({ sprintId, storyId })
    }
  }
  return resolved
}

describe('importSprintMembership', () => {
  const rows = [
    { associationType: 'IssueInSprint', sourceNodeEntity: 'Sprint', sinkNodeEntity: 'Issue', sourceNodeId: 'sprint-1', sinkNodeId: 'issue-10' },
    { associationType: 'IssueInSprint', sourceNodeEntity: 'Sprint', sinkNodeEntity: 'Issue', sourceNodeId: 'sprint-1', sinkNodeId: 'issue-11' },
    { associationType: 'IssueInSprint', sourceNodeEntity: 'Sprint', sinkNodeEntity: 'Issue', sourceNodeId: 'sprint-2', sinkNodeId: 'issue-12' },
    { associationType: 'IssueInVersion', sourceNodeEntity: 'Version', sinkNodeEntity: 'Issue', sourceNodeId: 'v-1', sinkNodeId: 'issue-13' },
  ]

  test('returns correct sprintCount', () => {
    const result = importSprintMembership(rows)
    expect(result.sprintCount).toBe(2)
  })

  test('returns correct issueCount (unique issues only)', () => {
    const result = importSprintMembership(rows)
    expect(result.issueCount).toBe(3)
  })

  test('returns correct totalAssociations', () => {
    const result = importSprintMembership(rows)
    expect(result.totalAssociations).toBe(3)
  })

  test('assignments contain correct jiraIssueIds per sprint', () => {
    const result = importSprintMembership(rows)
    const sprint1 = result.assignments.find((a) => a.jiraSprintId === 'sprint-1')
    expect(sprint1).toBeDefined()
    expect(sprint1.jiraIssueIds).toContain('issue-10')
    expect(sprint1.jiraIssueIds).toContain('issue-11')
  })

  test('returns zero counts for empty input', () => {
    const result = importSprintMembership([])
    expect(result.sprintCount).toBe(0)
    expect(result.issueCount).toBe(0)
    expect(result.totalAssociations).toBe(0)
    expect(result.assignments).toHaveLength(0)
  })

  test('does not count IssueInVersion associations', () => {
    const onlyVersion = [
      { associationType: 'IssueInVersion', sourceNodeEntity: 'Version', sinkNodeEntity: 'Issue', sourceNodeId: 'v-1', sinkNodeId: 'issue-13' },
    ]
    const result = importSprintMembership(onlyVersion)
    expect(result.sprintCount).toBe(0)
    expect(result.issueCount).toBe(0)
  })
})

describe('resolveSprintStoryIds', () => {
  test('resolves jira IDs to internal IDs', () => {
    const assignments = [
      { jiraSprintId: 'jira-sprint-1', jiraIssueIds: ['jira-issue-10', 'jira-issue-11'] },
    ]
    const issueMap = new Map([['jira-issue-10', 'story-abc'], ['jira-issue-11', 'story-def']])
    const sprintMap = new Map([['jira-sprint-1', 'sprint-xyz']])
    const result = resolveSprintStoryIds(assignments, issueMap, sprintMap)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ sprintId: 'sprint-xyz', storyId: 'story-abc' })
    expect(result[1]).toEqual({ sprintId: 'sprint-xyz', storyId: 'story-def' })
  })

  test('skips sprint when sprint ID not in map', () => {
    const assignments = [
      { jiraSprintId: 'missing-sprint', jiraIssueIds: ['jira-issue-10'] },
    ]
    const issueMap = new Map([['jira-issue-10', 'story-abc']])
    const sprintMap = new Map()
    const result = resolveSprintStoryIds(assignments, issueMap, sprintMap)
    expect(result).toHaveLength(0)
  })

  test('skips issue when issue ID not in map', () => {
    const assignments = [
      { jiraSprintId: 'jira-sprint-1', jiraIssueIds: ['unknown-issue'] },
    ]
    const issueMap = new Map()
    const sprintMap = new Map([['jira-sprint-1', 'sprint-xyz']])
    const result = resolveSprintStoryIds(assignments, issueMap, sprintMap)
    expect(result).toHaveLength(0)
  })

  test('handles multiple sprints with multiple issues', () => {
    const assignments = [
      { jiraSprintId: 'js-1', jiraIssueIds: ['ji-1', 'ji-2'] },
      { jiraSprintId: 'js-2', jiraIssueIds: ['ji-3'] },
    ]
    const issueMap = new Map([['ji-1', 's1'], ['ji-2', 's2'], ['ji-3', 's3']])
    const sprintMap = new Map([['js-1', 'sp1'], ['js-2', 'sp2']])
    const result = resolveSprintStoryIds(assignments, issueMap, sprintMap)
    expect(result).toHaveLength(3)
    const sprintIds = result.map((r) => r.sprintId)
    expect(sprintIds.filter((s) => s === 'sp1')).toHaveLength(2)
    expect(sprintIds.filter((s) => s === 'sp2')).toHaveLength(1)
  })

  test('returns empty array for empty assignments', () => {
    const result = resolveSprintStoryIds([], new Map(), new Map())
    expect(result).toHaveLength(0)
  })
})
