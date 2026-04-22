export type NodeAssociationRow = {
  sourceNodeId: string
  sourceNodeEntity: string
  sinkNodeId: string
  sinkNodeEntity: string
  associationType: string
}

export type SprintMembership = {
  sprintId: string
  issueIds: string[]
}

export type IssueSprintIndex = {
  bySprintId: Map<string, string[]>
  byIssueId: Map<string, string[]>
}

const SPRINT_ENTITY = 'Sprint'
const ISSUE_ENTITY = 'Issue'
const ISSUE_IN_SPRINT_TYPE = 'IssueInSprint'

export function filterSprintMembershipRows(
  rows: NodeAssociationRow[]
): NodeAssociationRow[] {
  return rows.filter(
    (row) =>
      row.associationType === ISSUE_IN_SPRINT_TYPE &&
      row.sourceNodeEntity === SPRINT_ENTITY &&
      row.sinkNodeEntity === ISSUE_ENTITY
  )
}

export function buildIssueSprintIndex(rows: NodeAssociationRow[]): IssueSprintIndex {
  const bySprintId = new Map<string, string[]>()
  const byIssueId = new Map<string, string[]>()

  const sprintRows = filterSprintMembershipRows(rows)

  for (const row of sprintRows) {
    const { sourceNodeId: sprintId, sinkNodeId: issueId } = row

    if (!bySprintId.has(sprintId)) {
      bySprintId.set(sprintId, [])
    }
    bySprintId.get(sprintId)!.push(issueId)

    if (!byIssueId.has(issueId)) {
      byIssueId.set(issueId, [])
    }
    byIssueId.get(issueId)!.push(sprintId)
  }

  return { bySprintId, byIssueId }
}

export function getSprintMemberships(index: IssueSprintIndex): SprintMembership[] {
  return Array.from(index.bySprintId.entries()).map(([sprintId, issueIds]) => ({
    sprintId,
    issueIds: [...issueIds],
  }))
}

export function getIssueSprintIds(
  index: IssueSprintIndex,
  issueId: string
): string[] {
  return index.byIssueId.get(issueId) ?? []
}

export function getSprintIssueIds(
  index: IssueSprintIndex,
  sprintId: string
): string[] {
  return index.bySprintId.get(sprintId) ?? []
}
