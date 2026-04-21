export interface JiraCustomFieldValue {
  fieldId: string
  value: string
}

export interface JiraCustomFieldValueRow {
  issue: number
  customfield: number
  numbervalue: number | null
  stringvalue: string | null
  textvalue: string | null
}

export interface JiraIssueRow {
  id: number
  issuenum: number
  pkey: string
  project: string
  summary: string
  issuetype: string
  issuestatus: string
  status: string
  priority: string
  assignee: string | null
  reporter: string | null
  description: string | null
  created: string
  updated: string
  parent_id: string | null
  duedate: string | null
  resolutiondate: string | null
  epic_link_id: number | null
  customFieldValues: JiraCustomFieldValue[]
}

export interface JiraFieldMapping {
  fieldId: string
  fieldName: string
  targetField: string
}

export interface AdaptedIssue {
  id: string
  pkey: string
  title: string
  issueType: string
  status: string
  priority: string
  description: string | null
  epicLinkId: string | null
  parentId: string | null
  dueDate: string | null
  resolutionDate: string | null
  assignee: string | null
  reporter: string | null
  customFields: Record<string, string>
}

export interface JiraEpicImport {
  jiraId: string
  pkey: string
  title: string
  status: string
  priority: string
  description: string | null
}

export interface JiraChildIssueImport {
  jiraId: string
  pkey: string
  title: string
  issueType: string
  status: string
  priority: string
  epicLinkPkey: string | null
  description: string | null
}

export interface EpicHierarchyImport {
  epics: JiraEpicImport[]
  children: JiraChildIssueImport[]
}

export const EPIC_LINK_FIELD_IDS = [
  'customfield_10014',
  'customfield_10008',
  'Epic Link',
] as const

export const EPIC_ISSUE_TYPE_NAMES = ['Epic', 'epic'] as const

export interface JiraProject {
  id: string
  pkey: string
  pname: string
  description?: string | null
  lead?: string | null
  url?: string | null
  projecttype?: string
  components?: JiraComponent[]
  versions?: JiraProjectVersion[]
}

export interface JiraComponent {
  id: string
  project: string
  name: string
  description?: string | null
  lead?: string | null
}

export interface JiraProjectVersion {
  id: string
  project: string
  vname: string
  description?: string | null
  released: boolean
  archived: boolean
  releasedate: string | null
  startdate: string | null
  sequence: number
}

export interface JiraSprintRow {
  ID: number
  NAME: string
  STATE: string
  START_DATE: string | null
  END_DATE: string | null
  COMPLETE_DATE: string | null
  GOAL: string | null
  RAPID_VIEW_ID?: number
  BOARD_ID?: number
}

export interface JiraBoardConfig {
  boardId: number
  columns: Array<{
    id: number
    name: string
    statusIds: number[]
  }>
}

export interface CwdUser {
  user_name: string
  lower_user_name: string
  display_name: string
  email_address: string
  active: boolean
  external_id: string | null
  directory_id: number
  created_date: string
  updated_date: string
}

export interface AppUser {
  user_key: string
  lower_user_name: string
}

export interface JiraPersona {
  userKey: string
  userName: string
  displayName: string
  emailAddress: string
  active: boolean
  externalId: string | null
  directoryId: number
  createdDate: string
  updatedDate: string
}

export interface AdapterContext {
  customFieldValues: JiraCustomFieldValueRow[]
  fieldMapping: {
    storyPointsFieldId: number
    epicLinkFieldId: number
    epicNameFieldId: number
  }
}

export interface JiraAdaptedUserStory {
  kind: 'story'
  jiraId: number
  pkey: string
  projectId: string
  issueNum: number
  title: string
  description: string | null
  status: string
  priority: string
  storyPoints: number | null
  assignee: string | null
  reporter: string | null
  epicLinkId: number | null
  parentId: string | null
  createdAt: Date
  updatedAt: Date
  dueDate: Date | null
  resolvedAt: Date | null
}

export interface JiraAdaptedEpic {
  kind: 'epic'
  jiraId: number
  pkey: string
  projectId: string
  issueNum: number
  title: string
  description: string | null
  status: string
  priority: string
  storyPoints: number | null
  assignee: string | null
  reporter: string | null
  epicName: string | null
  createdAt: Date
  updatedAt: Date
  dueDate: Date | null
  resolvedAt: Date | null
}

export interface JiraIssueLink {
  id: string
  type: JiraIssueLinkType
  linkTypeId: string
  sourceIssueKey: string
  destinationIssueKey: string
  inwardIssue?: { id: string; key: string } | null
  outwardIssue?: { id: string; key: string } | null
}

export interface JiraIssueLinkType {
  id: string
  name: string
  linkTypeName?: string
  inward: string
  outward: string
}

export interface Dependency {
  id?: string
  blockerId: string
  blockedId: string
  jiraSourceKey?: string
  jiraDestKey?: string
  jiraLinkType?: string
  createdAt?: Date
}

export interface MappedProject {
  jiraId: string
  pkey: string
  name: string
  description?: string | null
  lead?: string | null
  url?: string | null
  projectType?: string
}

export interface MappedWorkstream {
  jiraComponentId: string
  jiraProjectId: string
  name: string
  description?: string | null
  lead?: string | null
}

export interface MappedMilestone {
  jiraVersionId: string
  jiraProjectId: string
  name: string
  description?: string | null
  status: 'upcoming' | 'completed' | 'archived'
  releaseDate: Date | null
  startDate: Date | null
  sequence: number
}

export interface JiraProjectAdapterResult {
  project: MappedProject
  workstreams: MappedWorkstream[]
  milestones: MappedMilestone[]
}
