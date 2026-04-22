const STATUS_MAP: Record<string, string> = {
  'To Do': 'backlog',
  'to do': 'backlog',
  TODO: 'backlog',
  Backlog: 'backlog',
  backlog: 'backlog',
  'In Progress': 'active',
  'in progress': 'active',
  'IN PROGRESS': 'active',
  Active: 'active',
  active: 'active',
  'In Review': 'active',
  'Code Review': 'active',
  Done: 'done',
  done: 'done',
  DONE: 'done',
  Closed: 'done',
  closed: 'done',
  Resolved: 'done',
  resolved: 'done',
}

const PRIORITY_MAP: Record<string, string> = {
  Highest: 'critical',
  highest: 'critical',
  Critical: 'critical',
  critical: 'critical',
  High: 'high',
  high: 'high',
  Medium: 'medium',
  medium: 'medium',
  Low: 'low',
  low: 'low',
  Lowest: 'low',
  lowest: 'low',
}

export function normalizeStatus(jiraStatus: string): string {
  return STATUS_MAP[jiraStatus] ?? 'backlog'
}

export function normalizePriority(jiraPriority: string): string {
  return PRIORITY_MAP[jiraPriority] ?? 'medium'
}
