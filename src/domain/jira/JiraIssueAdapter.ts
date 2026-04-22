import type {
  JiraIssueRow,
  JiraCustomFieldValueRow,
  JiraFieldMapping,
  AdaptedIssue,
  JiraAdaptedUserStory as UserStory,
  JiraAdaptedEpic as Epic,
  AdapterContext,
} from './types'
import { normalizeStatus, normalizePriority } from './fieldMapping'

const EPIC_ISSUE_TYPES = new Set([
  'Epic',
  'epic',
  'EPIC',
])

function isEpicIssueType(issuetype: string): boolean {
  return EPIC_ISSUE_TYPES.has(issuetype) || issuetype.toLowerCase() === 'epic'
}

function parseDate(value: string | null): Date | null {
  if (value === null || value.trim() === '') {
    return null
  }
  const parsed = new Date(value)
  if (isNaN(parsed.getTime())) {
    return null
  }
  return parsed
}

function lookupStoryPoints(
  issueId: number,
  customFieldValues: JiraCustomFieldValueRow[],
  storyPointsFieldId: number,
): number | null {
  const field = customFieldValues.find(
    (cfv) => cfv.issue === issueId && cfv.customfield === storyPointsFieldId,
  )
  if (field === undefined) {
    return null
  }
  if (field.numbervalue !== null && isFinite(field.numbervalue)) {
    return field.numbervalue
  }
  if (field.stringvalue !== null && field.stringvalue.trim() !== '') {
    const parsed = parseFloat(field.stringvalue)
    if (!isNaN(parsed) && isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

function lookupEpicName(
  issueId: number,
  customFieldValues: JiraCustomFieldValueRow[],
  epicNameFieldId: number,
): string | null {
  const field = customFieldValues.find(
    (cfv) => cfv.issue === issueId && cfv.customfield === epicNameFieldId,
  )
  if (field === undefined) {
    return null
  }
  if (field.stringvalue !== null && field.stringvalue.trim() !== '') {
    return field.stringvalue.trim()
  }
  if (field.textvalue !== null && field.textvalue.trim() !== '') {
    return field.textvalue.trim()
  }
  return null
}

function lookupEpicLinkId(
  issueId: number,
  customFieldValues: JiraCustomFieldValueRow[],
  epicLinkFieldId: number,
  issueRow: JiraIssueRow,
): number | null {
  if (issueRow.epic_link_id !== null) {
    return issueRow.epic_link_id
  }
  const field = customFieldValues.find(
    (cfv) => cfv.issue === issueId && cfv.customfield === epicLinkFieldId,
  )
  if (field === undefined) {
    return null
  }
  if (field.numbervalue !== null && isFinite(field.numbervalue)) {
    return Math.round(field.numbervalue)
  }
  if (field.stringvalue !== null) {
    const parsed = parseInt(field.stringvalue, 10)
    if (!isNaN(parsed)) {
      return parsed
    }
  }
  return null
}

function adaptToUserStory(
  row: JiraIssueRow,
  context: AdapterContext,
): UserStory {
  const { customFieldValues, fieldMapping } = context
  const storyPoints = lookupStoryPoints(
    row.id,
    customFieldValues,
    fieldMapping.storyPointsFieldId,
  )
  const epicLinkId = lookupEpicLinkId(
    row.id,
    customFieldValues,
    fieldMapping.epicLinkFieldId,
    row,
  )
  return {
    kind: 'story',
    jiraId: row.id,
    pkey: row.pkey,
    projectId: row.project,
    issueNum: row.issuenum,
    title: row.summary.trim(),
    description: row.description !== null && row.description.trim() !== ''
      ? row.description.trim()
      : null,
    status: normalizeStatus(row.status),
    priority: normalizePriority(row.priority),
    storyPoints,
    assignee: row.assignee,
    reporter: row.reporter,
    epicLinkId,
    parentId: row.parent_id,
    createdAt: new Date(row.created),
    updatedAt: new Date(row.updated),
    dueDate: parseDate(row.duedate),
    resolvedAt: parseDate(row.resolutiondate),
  }
}

function adaptToEpic(
  row: JiraIssueRow,
  context: AdapterContext,
): Epic {
  const { customFieldValues, fieldMapping } = context
  const storyPoints = lookupStoryPoints(
    row.id,
    customFieldValues,
    fieldMapping.storyPointsFieldId,
  )
  const epicName = lookupEpicName(
    row.id,
    customFieldValues,
    fieldMapping.epicNameFieldId,
  )
  return {
    kind: 'epic',
    jiraId: row.id,
    pkey: row.pkey,
    projectId: row.project,
    issueNum: row.issuenum,
    title: row.summary.trim(),
    description: row.description !== null && row.description.trim() !== ''
      ? row.description.trim()
      : null,
    status: normalizeStatus(row.status),
    priority: normalizePriority(row.priority),
    storyPoints,
    assignee: row.assignee,
    reporter: row.reporter,
    epicName,
    createdAt: new Date(row.created),
    updatedAt: new Date(row.updated),
    dueDate: parseDate(row.duedate),
    resolvedAt: parseDate(row.resolutiondate),
  }
}

export function adaptJiraIssue(
  row: JiraIssueRow,
  context: AdapterContext,
): UserStory | Epic {
  if (isEpicIssueType(row.issuetype)) {
    return adaptToEpic(row, context)
  }
  return adaptToUserStory(row, context)
}

export function adaptJiraIssues(
  rows: JiraIssueRow[],
  context: AdapterContext,
): (UserStory | Epic)[] {
  return rows.map((row) => adaptJiraIssue(row, context))
}
