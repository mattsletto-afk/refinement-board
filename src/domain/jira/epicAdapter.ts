import type {
  JiraIssueRow,
  JiraEpicImport,
  JiraChildIssueImport,
  EpicHierarchyImport,
} from './types'
import {
  EPIC_LINK_FIELD_IDS,
  EPIC_ISSUE_TYPE_NAMES,
} from './types'
import { normalizeStatus, normalizePriority } from './fieldMapping'

function isEpicIssueType(issueType: string): boolean {
  return EPIC_ISSUE_TYPE_NAMES.some(
    (name) => name.toLowerCase() === issueType.toLowerCase()
  )
}

function resolveEpicLinkPkey(
  customFieldValues: JiraIssueRow['customFieldValues']
): string | null {
  for (const fieldId of EPIC_LINK_FIELD_IDS) {
    const match = customFieldValues.find((cfv) => cfv.fieldId === fieldId)
    if (match && match.value.trim() !== '') {
      return match.value.trim()
    }
  }
  return null
}

export function adaptJiraEpic(row: JiraIssueRow): JiraEpicImport {
  return {
    jiraId: String(row.id),
    pkey: row.pkey,
    title: row.summary,
    status: normalizeStatus(row.issuestatus),
    priority: normalizePriority(row.priority),
    description: row.description ?? null,
  }
}

export function adaptJiraChildIssue(row: JiraIssueRow): JiraChildIssueImport {
  return {
    jiraId: String(row.id),
    pkey: row.pkey,
    title: row.summary,
    issueType: row.issuetype,
    status: normalizeStatus(row.issuestatus),
    priority: normalizePriority(row.priority),
    epicLinkPkey: resolveEpicLinkPkey(row.customFieldValues),
    description: row.description ?? null,
  }
}

export function buildEpicHierarchy(rows: JiraIssueRow[]): EpicHierarchyImport {
  const epics: JiraEpicImport[] = []
  const children: JiraChildIssueImport[] = []

  for (const row of rows) {
    if (isEpicIssueType(row.issuetype)) {
      epics.push(adaptJiraEpic(row))
    } else {
      children.push(adaptJiraChildIssue(row))
    }
  }

  return { epics, children }
}
