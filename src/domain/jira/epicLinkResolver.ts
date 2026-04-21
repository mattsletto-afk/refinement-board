import type {
  JiraEpicImport,
  JiraChildIssueImport,
  EpicHierarchyImport,
} from './types'

export interface ResolvedChild {
  child: JiraChildIssueImport
  epicJiraId: string | null
}

export interface EpicResolutionResult {
  epics: JiraEpicImport[]
  resolvedChildren: ResolvedChild[]
  unmatchedEpicLinks: string[]
}

export function resolveEpicLinks(
  hierarchy: EpicHierarchyImport
): EpicResolutionResult {
  const epicByPkey = new Map<string, JiraEpicImport>(
    hierarchy.epics.map((epic) => [epic.pkey, epic])
  )

  const unmatchedEpicLinks: string[] = []
  const resolvedChildren: ResolvedChild[] = []

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

export function groupChildrenByEpic(
  resolvedChildren: ResolvedChild[]
): Map<string | null, JiraChildIssueImport[]> {
  const grouped = new Map<string | null, JiraChildIssueImport[]>()

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
