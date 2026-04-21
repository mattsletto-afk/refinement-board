export type JiraIssueType = 'Story' | 'Epic' | 'Sub-task' | 'Bug' | 'Task' | 'Improvement' | string

export type JiraIssueStatus = 'Backlog' | 'To Do' | 'In Progress' | 'Done' | 'Closed' | 'Resolved' | string

export type JiraIssuePriority = 'Blocker' | 'Critical' | 'Major' | 'Minor' | 'Trivial' | string

export interface JiraCustomFieldValue {
  customfieldId: string
  value: string | null
}

export interface JiraIssue {
  id: string
  key: string
  summary: string
  description: string | null
  issueType: JiraIssueType
  status: JiraIssueStatus
  priority: JiraIssuePriority | null
  assigneeKey: string | null
  reporterKey: string | null
  projectKey: string
  storyPoints: number | null
  epicLink: string | null
  parentId: string | null
  created: string | null
  updated: string | null
  resolved: string | null
  labels: string[]
  fixVersions: string[]
  components: string[]
  customFieldValues: JiraCustomFieldValue[]
}

export interface JiraProject {
  id: string
  key: string
  name: string
  description: string | null
  leadKey: string | null
}

export interface JiraProjectVersion {
  id: string
  projectId: string
  name: string
  description: string | null
  released: boolean
  releaseDate: string | null
}

export interface JiraComponent {
  id: string
  projectId: string
  name: string
  description: string | null
  leadKey: string | null
}

export interface JiraUser {
  id: string
  userKey: string
  username: string
  displayName: string
  email: string | null
  active: boolean
}

export interface JiraSprint {
  id: string
  name: string
  state: 'ACTIVE' | 'CLOSED' | 'FUTURE' | string
  startDate: string | null
  endDate: string | null
  completeDate: string | null
  boardId: string | null
  goal: string | null
}

export interface JiraBoard {
  id: string
  name: string
  type: 'scrum' | 'kanban' | string
  projectKey: string | null
}

export interface JiraIssueLink {
  id: string
  sourceIssueId: string
  destinationIssueId: string
  linkTypeName: string
  isInward: boolean
}

export interface JiraNodeAssociation {
  sourceNodeId: string
  sourceNodeEntity: string
  sinkNodeId: string
  sinkNodeEntity: string
  associationType: string
}

export interface JiraCustomField {
  id: string
  name: string
  fieldType: string
  customfieldtypekey: string | null
}

export interface JiraImportResult {
  issues: JiraIssue[]
  projects: JiraProject[]
  versions: JiraProjectVersion[]
  components: JiraComponent[]
  users: JiraUser[]
  sprints: JiraSprint[]
  boards: JiraBoard[]
  issueLinks: JiraIssueLink[]
  nodeAssociations: JiraNodeAssociation[]
  customFields: JiraCustomField[]
  parseErrors: JiraParseError[]
}

export interface JiraParseError {
  entity: string
  id: string | null
  message: string
}
