import {
  buildIssueSprintIndex,
  getSprintMemberships,
  type IssueSprintIndex,
  type NodeAssociationRow,
  type SprintMembership,
} from './sprintMembershipAdapter'

export type SprintStoryAssignment = {
  jiraSprintId: string
  jiraIssueIds: string[]
}

export type SprintMembershipImportResult = {
  assignments: SprintStoryAssignment[]
  totalAssociations: number
  sprintCount: number
  issueCount: number
}

export function importSprintMembership(
  rows: NodeAssociationRow[]
): SprintMembershipImportResult {
  const index: IssueSprintIndex = buildIssueSprintIndex(rows)
  const memberships: SprintMembership[] = getSprintMemberships(index)

  const assignments: SprintStoryAssignment[] = memberships.map((m) => ({
    jiraSprintId: m.sprintId,
    jiraIssueIds: m.issueIds,
  }))

  const totalAssociations = assignments.reduce(
    (sum, a) => sum + a.jiraIssueIds.length,
    0
  )

  const uniqueIssueIds = new Set(index.byIssueId.keys())

  return {
    assignments,
    totalAssociations,
    sprintCount: assignments.length,
    issueCount: uniqueIssueIds.size,
  }
}

export function resolveSprintStoryIds(
  assignments: SprintStoryAssignment[],
  jiraIssueIdToStoryId: Map<string, string>,
  jiraSprintIdToSprintId: Map<string, string>
): Array<{ sprintId: string; storyId: string }> {
  const resolved: Array<{ sprintId: string; storyId: string }> = []

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
