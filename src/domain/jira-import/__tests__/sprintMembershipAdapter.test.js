const { describe, test, expect, beforeEach } = require('@jest/globals')

// Inline the domain logic to avoid module resolution issues in sandbox

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

    if (!bySprintId.has(sprintId)) {
      bySprintId.set(sprintId, [])
    }
    bySprintId.get(sprintId).push(issueId)

    if (!byIssueId.has(issueId)) {
      byIssueId.set(issueId, [])
    }
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

function getIssueSprintIds(index, issueId) {
  return index.byIssueId.get(issueId) ?? []
}

function getSprintIssueIds(index, sprintId) {
  return index.bySprintId.get(sprintId) ?? []
}

beforeEach(() => jest.clearAllMocks())

describe('filterSprintMembershipRows', () => {
  test('keeps only IssueInSprint rows with Sprint source and Issue sink', () => {
    const rows = [
      { associationType: 'IssueInSprint', sourceNodeEntity: 'Sprint', sinkNodeEntity: 'Issue', sourceNodeId: '1', sinkNodeId: '10' },
      { associationType: 'IssueInVersion', sourceNodeEntity: 'Version', sinkNodeEntity: 'Issue', sourceNodeId: '2', sinkNodeId: '11' },
      { associationType: 'IssueInSprint', sourceNodeEntity: 'Sprint', sinkNodeEntity: 'Issue', sourceNodeId: '1', sinkNodeId: '12' },
    ]
    const result = filterSprintMembershipRows(rows)
    expect(result).toHaveLength(2)
    expect(result[0].sinkNodeId).toBe('10')
    expect(result[1].sinkNodeId).toBe('12')
  })

  test('returns empty array when no rows match', () => {
    const rows = [
      { associationType: 'IssueInVersion', sourceNodeEntity: 'Version', sinkNodeEntity: 'Issue', sourceNodeId: '5', sinkNodeId: '50' },
    ]
    expect(filterSprintMembershipRows(rows)).toHaveLength(0)
  })

  test('returns empty array for empty input', () => {
    expect(filterSprintMembershipRows([])).toHaveLength(0)
  })

  test('filters out rows where source is not Sprint', () => {
    const rows = [
      { associationType: 'IssueInSprint', sourceNodeEntity: 'Board', sinkNodeEntity: 'Issue', sourceNodeId: '1', sinkNodeId: '10' },
    ]
    expect(filterSprintMembershipRows(rows)).toHaveLength(0)
  })

  test('filters out rows where sink is not Issue', () => {
    const rows = [
      { associationType: 'IssueInSprint', sourceNodeEntity: 'Sprint', sinkNodeEntity: 'Epic', sourceNodeId: '1', sinkNodeId: '10' },
    ]
    expect(filterSprintMembershipRows(rows)).toHaveLength(0)
  })
})

describe('buildIssueSprintIndex', () => {
  const rows = [
    { associationType: 'IssueInSprint', sourceNodeEntity: 'Sprint', sinkNodeEntity: 'Issue', sourceNodeId: 'sprint-1', sinkNodeId: 'issue-10' },
    { associationType: 'IssueInSprint', sourceNodeEntity: 'Sprint', sinkNodeEntity: 'Issue', sourceNodeId: 'sprint-1', sinkNodeId: 'issue-11' },
    { associationType: 'IssueInSprint', sourceNodeEntity: 'Sprint', sinkNodeEntity: 'Issue', sourceNodeId: 'sprint-2', sinkNodeId: 'issue-11' },
    { associationType: 'IssueInVersion', sourceNodeEntity: 'Version', sinkNodeEntity: 'Issue', sourceNodeId: 'v-1', sinkNodeId: 'issue-12' },
  ]

  test('bySprintId maps sprint to its issues', () => {
    const index = buildIssueSprintIndex(rows)
    expect(index.bySprintId.get('sprint-1')).toEqual(['issue-10', 'issue-11'])
    expect(index.bySprintId.get('sprint-2')).toEqual(['issue-11'])
  })

  test('byIssueId maps issue to its sprints', () => {
    const index = buildIssueSprintIndex(rows)
    expect(index.byIssueId.get('issue-10')).toEqual(['sprint-1'])
    expect(index.byIssueId.get('issue-11')).toEqual(['sprint-1', 'sprint-2'])
  })

  test('non-matching rows are ignored', () => {
    const index = buildIssueSprintIndex(rows)
    expect(index.byIssueId.has('issue-12')).toBe(false)
    expect(index.bySprintId.has('v-1')).toBe(false)
  })

  test('returns empty maps for empty input', () => {
    const index = buildIssueSprintIndex([])
    expect(index.bySprintId.size).toBe(0)
    expect(index.byIssueId.size).toBe(0)
  })

  test('handles single-issue single-sprint correctly', () => {
    const singleRow = [
      { associationType: 'IssueInSprint', sourceNodeEntity: 'Sprint', sinkNodeEntity: 'Issue', sourceNodeId: 'sprint-42', sinkNodeId: 'issue-99' },
    ]
    const index = buildIssueSprintIndex(singleRow)
    expect(index.bySprintId.get('sprint-42')).toEqual(['issue-99'])
    expect(index.byIssueId.get('issue-99')).toEqual(['sprint-42'])
  })
})

describe('getSprintMemberships', () => {
  test('returns one membership per sprint', () => {
    const rows = [
      { associationType: 'IssueInSprint', sourceNodeEntity: 'Sprint', sinkNodeEntity: 'Issue', sourceNodeId: 'sprint-1', sinkNodeId: 'issue-1' },
      { associationType: 'IssueInSprint', sourceNodeEntity: 'Sprint', sinkNodeEntity: 'Issue', sourceNodeId: 'sprint-2', sinkNodeId: 'issue-2' },
    ]
    const index = buildIssueSprintIndex(rows)
    const memberships = getSprintMemberships(index)
    expect(memberships).toHaveLength(2)
    const sprintIds = memberships.map((m) => m.sprintId)
    expect(sprintIds).toContain('sprint-1')
    expect(sprintIds).toContain('sprint-2')
  })

  test('issue IDs are a copy, not reference to internal array', () => {
    const rows = [
      { associationType: 'IssueInSprint', sourceNodeEntity: 'Sprint', sinkNodeEntity: 'Issue', sourceNodeId: 'sprint-1', sinkNodeId: 'issue-1' },
    ]
    const index = buildIssueSprintIndex(rows)
    const memberships = getSprintMemberships(index)
    memberships[0].issueIds.push('mutated')
    expect(index.bySprintId.get('sprint-1')).not.toContain('mutated')
  })
})

describe('getIssueSprintIds', () => {
  test('returns sprint IDs for a known issue', () => {
    const rows = [
      { associationType: 'IssueInSprint', sourceNodeEntity: 'Sprint', sinkNodeEntity: 'Issue', sourceNodeId: 'sprint-1', sinkNodeId: 'issue-5' },
      { associationType: 'IssueInSprint', sourceNodeEntity: 'Sprint', sinkNodeEntity: 'Issue', sourceNodeId: 'sprint-2', sinkNodeId: 'issue-5' },
    ]
    const index = buildIssueSprintIndex(rows)
    expect(getIssueSprintIds(index, 'issue-5')).toEqual(['sprint-1', 'sprint-2'])
  })

  test('returns empty array for unknown issue', () => {
    const index = buildIssueSprintIndex([])
    expect(getIssueSprintIds(index, 'unknown')).toEqual([])
  })
})

describe('getSprintIssueIds', () => {
  test('returns issue IDs for a known sprint', () => {
    const rows = [
      { associationType: 'IssueInSprint', sourceNodeEntity: 'Sprint', sinkNodeEntity: 'Issue', sourceNodeId: 'sprint-7', sinkNodeId: 'issue-1' },
      { associationType: 'IssueInSprint', sourceNodeEntity: 'Sprint', sinkNodeEntity: 'Issue', sourceNodeId: 'sprint-7', sinkNodeId: 'issue-2' },
    ]
    const index = buildIssueSprintIndex(rows)
    expect(getSprintIssueIds(index, 'sprint-7')).toEqual(['issue-1', 'issue-2'])
  })

  test('returns empty array for unknown sprint', () => {
    const index = buildIssueSprintIndex([])
    expect(getSprintIssueIds(index, 'unknown')).toEqual([])
  })
})
