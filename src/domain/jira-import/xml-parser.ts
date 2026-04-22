import { createReadStream } from 'fs'
import * as sax from 'sax'
import type {
  JiraImportResult,
  JiraIssue,
  JiraProject,
  JiraProjectVersion,
  JiraComponent,
  JiraUser,
  JiraSprint,
  JiraBoard,
  JiraIssueLink,
  JiraNodeAssociation,
  JiraCustomField,
  JiraCustomFieldValue,
  JiraParseError,
} from './types'

interface ParseContext {
  currentElement: string | null
  currentAttributes: Record<string, string>
  textBuffer: string
  currentIssue: Partial<JiraIssue> | null
  currentProject: Partial<JiraProject> | null
  currentVersion: Partial<JiraProjectVersion> | null
  currentComponent: Partial<JiraComponent> | null
  currentUser: Partial<JiraUser> | null
  currentSprint: Partial<JiraSprint> | null
  currentBoard: Partial<JiraBoard> | null
  currentIssueLink: Partial<JiraIssueLink> | null
  currentNodeAssociation: Partial<JiraNodeAssociation> | null
  currentCustomField: Partial<JiraCustomField> | null
  currentCustomFieldValue: Partial<JiraCustomFieldValue> | null
  insideItem: boolean
  itemType: string | null
  parentStack: string[]
  currentLabels: string[]
  currentFixVersions: string[]
  currentComponents: string[]
  currentCustomFieldValues: JiraCustomFieldValue[]
}

function createEmptyResult(): JiraImportResult {
  return {
    issues: [],
    projects: [],
    versions: [],
    components: [],
    users: [],
    sprints: [],
    boards: [],
    issueLinks: [],
    nodeAssociations: [],
    customFields: [],
    parseErrors: [],
  }
}

function createEmptyContext(): ParseContext {
  return {
    currentElement: null,
    currentAttributes: {},
    textBuffer: '',
    currentIssue: null,
    currentProject: null,
    currentVersion: null,
    currentComponent: null,
    currentUser: null,
    currentSprint: null,
    currentBoard: null,
    currentIssueLink: null,
    currentNodeAssociation: null,
    currentCustomField: null,
    currentCustomFieldValue: null,
    insideItem: false,
    itemType: null,
    parentStack: [],
    currentLabels: [],
    currentFixVersions: [],
    currentComponents: [],
    currentCustomFieldValues: [],
  }
}

function attr(attributes: Record<string, string>, name: string): string | null {
  return attributes[name] ?? null
}

function attrRequired(attributes: Record<string, string>, name: string): string {
  return attributes[name] ?? ''
}

function handleIssueOpen(ctx: ParseContext, attrs: Record<string, string>): void {
  ctx.currentIssue = {
    id: attrRequired(attrs, 'id'),
    key: attrRequired(attrs, 'key'),
    summary: '',
    description: null,
    issueType: 'Story',
    status: 'Backlog',
    priority: null,
    assigneeKey: null,
    reporterKey: null,
    projectKey: '',
    storyPoints: null,
    epicLink: null,
    parentId: null,
    created: null,
    updated: null,
    resolved: null,
    labels: [],
    fixVersions: [],
    components: [],
    customFieldValues: [],
  }
  ctx.currentLabels = []
  ctx.currentFixVersions = []
  ctx.currentComponents = []
  ctx.currentCustomFieldValues = []
  ctx.insideItem = true
  ctx.itemType = 'issue'
}

function handleIssueField(
  ctx: ParseContext,
  element: string,
  attrs: Record<string, string>,
  text: string,
  result: JiraImportResult,
): void {
  if (!ctx.currentIssue) return

  switch (element) {
    case 'summary':
      ctx.currentIssue.summary = text
      break
    case 'description':
      ctx.currentIssue.description = text || null
      break
    case 'type':
      ctx.currentIssue.issueType = attr(attrs, 'iconUrl')
        ? text
        : (attr(attrs, 'id') ? text : text)
      ctx.currentIssue.issueType = text || 'Story'
      break
    case 'status':
      ctx.currentIssue.status = text || 'Backlog'
      break
    case 'priority':
      ctx.currentIssue.priority = text || null
      break
    case 'assignee':
      ctx.currentIssue.assigneeKey = attr(attrs, 'accountid') ?? attr(attrs, 'key') ?? (text || null)
      break
    case 'reporter':
      ctx.currentIssue.reporterKey = attr(attrs, 'accountid') ?? attr(attrs, 'key') ?? (text || null)
      break
    case 'project':
      ctx.currentIssue.projectKey = attr(attrs, 'key') ?? text ?? ''
      break
    case 'created':
      ctx.currentIssue.created = text || null
      break
    case 'updated':
      ctx.currentIssue.updated = text || null
      break
    case 'resolved':
      ctx.currentIssue.resolved = text || null
      break
    case 'parent':
      ctx.currentIssue.parentId = attr(attrs, 'id') ?? text ?? null
      break
    case 'label':
      if (text) ctx.currentLabels.push(text)
      break
    case 'fixVersion':
      if (text) ctx.currentFixVersions.push(text)
      break
    case 'component':
      if (text) ctx.currentComponents.push(text)
      break
    case 'customfieldvalue': {
      if (ctx.currentCustomFieldValue) {
        ctx.currentCustomFieldValue.value = text || null
      }
      break
    }
  }
}

function finalizeIssue(ctx: ParseContext, result: JiraImportResult): void {
  if (!ctx.currentIssue) return

  ctx.currentIssue.labels = ctx.currentLabels
  ctx.currentIssue.fixVersions = ctx.currentFixVersions
  ctx.currentIssue.components = ctx.currentComponents
  ctx.currentIssue.customFieldValues = ctx.currentCustomFieldValues

  for (const cfv of ctx.currentCustomFieldValues) {
    if (
      cfv.customfieldId &&
      (cfv.customfieldId.toLowerCase().includes('storypoint') ||
        cfv.customfieldId.toLowerCase().includes('story_point') ||
        cfv.customfieldId === 'customfield_10016' ||
        cfv.customfieldId === 'customfield_10028')
    ) {
      const points = parseFloat(cfv.value ?? '')
      if (!isNaN(points)) {
        ctx.currentIssue.storyPoints = points
      }
    }
    if (
      cfv.customfieldId &&
      (cfv.customfieldId.toLowerCase().includes('epiclink') ||
        cfv.customfieldId === 'customfield_10014' ||
        cfv.customfieldId === 'customfield_10008')
    ) {
      ctx.currentIssue.epicLink = cfv.value
    }
  }

  result.issues.push(ctx.currentIssue as JiraIssue)
  ctx.currentIssue = null
  ctx.currentLabels = []
  ctx.currentFixVersions = []
  ctx.currentComponents = []
  ctx.currentCustomFieldValues = []
}

function parseXmlStream(
  xmlStream: NodeJS.ReadableStream,
): Promise<JiraImportResult> {
  return new Promise((resolve, reject) => {
    const result = createEmptyResult()
    const ctx = createEmptyContext()

    const parser = sax.createStream(false, {
      lowercase: true,
      trim: true,
      normalize: true,
    })

    parser.on('error', (err: Error) => {
      result.parseErrors.push({
        entity: 'xml',
        id: null,
        message: err.message,
      })
      parser.resume()
    })

    parser.on('opentag', (node: sax.Tag) => {
      const name = node.name.toLowerCase()
      const attrs = node.attributes as Record<string, string>

      ctx.parentStack.push(name)
      ctx.currentElement = name
      ctx.textBuffer = ''
      ctx.currentAttributes = attrs

      const parent = ctx.parentStack[ctx.parentStack.length - 2] ?? null

      switch (name) {
        case 'item':
          handleIssueOpen(ctx, attrs)
          break

        case 'project':
          if (!ctx.insideItem) {
            ctx.currentProject = {
              id: attr(attrs, 'id') ?? '',
              key: attr(attrs, 'key') ?? '',
              name: '',
              description: null,
              leadKey: null,
            }
            ctx.itemType = 'project'
          }
          break

        case 'version':
          if (!ctx.insideItem) {
            ctx.currentVersion = {
              id: attr(attrs, 'id') ?? '',
              projectId: attr(attrs, 'project') ?? '',
              name: '',
              description: null,
              released: attr(attrs, 'released') === 'true',
              releaseDate: attr(attrs, 'releasedate') ?? null,
            }
            ctx.itemType = 'version'
          }
          break

        case 'component':
          if (!ctx.insideItem) {
            ctx.currentComponent = {
              id: attr(attrs, 'id') ?? '',
              projectId: attr(attrs, 'project') ?? '',
              name: '',
              description: null,
              leadKey: null,
            }
            ctx.itemType = 'component'
          }
          break

        case 'user':
        case 'cwd_user': {
          const userId = attr(attrs, 'id') ?? attr(attrs, 'user_key') ?? ''
          ctx.currentUser = {
            id: userId,
            userKey: attr(attrs, 'user_key') ?? attr(attrs, 'key') ?? userId,
            username: attr(attrs, 'lower_user_name') ?? attr(attrs, 'username') ?? '',
            displayName: attr(attrs, 'display_name') ?? '',
            email: attr(attrs, 'email_address') ?? null,
            active: attr(attrs, 'active') !== 'false',
          }
          ctx.itemType = 'user'
          break
        }

        case 'ao_60db71_sprint': {
          ctx.currentSprint = {
            id: attr(attrs, 'id') ?? '',
            name: attr(attrs, 'name') ?? '',
            state: attr(attrs, 'state') ?? 'FUTURE',
            startDate: attr(attrs, 'start_date') ?? null,
            endDate: attr(attrs, 'end_date') ?? null,
            completeDate: attr(attrs, 'complete_date') ?? null,
            boardId: attr(attrs, 'rapid_view_id') ?? null,
            goal: attr(attrs, 'goal') ?? null,
          }
          ctx.itemType = 'sprint'
          break
        }

        case 'board':
        case 'rapidview': {
          ctx.currentBoard = {
            id: attr(attrs, 'id') ?? '',
            name: attr(attrs, 'name') ?? '',
            type: attr(attrs, 'sprintssupported') === 'true' ? 'scrum' : 'kanban',
            projectKey: attr(attrs, 'project') ?? null,
          }
          ctx.itemType = 'board'
          break
        }

        case 'issuelink': {
          if (!ctx.insideItem) {
            ctx.currentIssueLink = {
              id: attr(attrs, 'id') ?? '',
              sourceIssueId: attr(attrs, 'source') ?? '',
              destinationIssueId: attr(attrs, 'destination') ?? '',
              linkTypeName: attr(attrs, 'linktype') ?? '',
              isInward: attr(attrs, 'sequence') === '0',
            }
            ctx.itemType = 'issuelink'
          }
          break
        }

        case 'nodeassociation': {
          const assoc: JiraNodeAssociation = {
            sourceNodeId: attr(attrs, 'sourcenode') ?? attr(attrs, 'source_node_id') ?? '',
            sourceNodeEntity: attr(attrs, 'sourceentity') ?? attr(attrs, 'source_node_entity') ?? '',
            sinkNodeId: attr(attrs, 'sinknode') ?? attr(attrs, 'sink_node_id') ?? '',
            sinkNodeEntity: attr(attrs, 'sinkentity') ?? attr(attrs, 'sink_node_entity') ?? '',
            associationType: attr(attrs, 'associationtype') ?? attr(attrs, 'association_type') ?? '',
          }
          result.nodeAssociations.push(assoc)
          break
        }

        case 'customfield': {
          if (!ctx.insideItem) {
            ctx.currentCustomField = {
              id: attr(attrs, 'id') ?? '',
              name: '',
              fieldType: '',
              customfieldtypekey: attr(attrs, 'customfieldtypekey') ?? null,
            }
            ctx.itemType = 'customfield'
          } else {
            ctx.currentCustomFieldValue = {
              customfieldId: attr(attrs, 'id') ?? '',
              value: null,
            }
          }
          break
        }
      }
    })

    parser.on('text', (text: string) => {
      ctx.textBuffer += text
    })

    parser.on('cdata', (text: string) => {
      ctx.textBuffer += text
    })

    parser.on('closetag', (name: string) => {
      const lname = name.toLowerCase()
      const text = ctx.textBuffer.trim()
      ctx.textBuffer = ''

      ctx.parentStack.pop()

      if (ctx.insideItem && ctx.currentIssue) {
        if (lname === 'item') {
          finalizeIssue(ctx, result)
          ctx.insideItem = false
          ctx.itemType = null
          return
        }

        if (lname === 'customfield') {
          if (ctx.currentCustomFieldValue) {
            ctx.currentCustomFieldValues.push(ctx.currentCustomFieldValue as JiraCustomFieldValue)
            ctx.currentCustomFieldValue = null
          }
          return
        }

        if (lname === 'customfieldvalue' && ctx.currentCustomFieldValue) {
          ctx.currentCustomFieldValue.value = text || null
          return
        }

        handleIssueField(ctx, lname, ctx.currentAttributes, text, result)
        return
      }

      switch (lname) {
        case 'project':
          if (ctx.currentProject) {
            result.projects.push(ctx.currentProject as JiraProject)
            ctx.currentProject = null
            ctx.itemType = null
          }
          break

        case 'version':
          if (ctx.currentVersion && ctx.itemType === 'version') {
            result.versions.push(ctx.currentVersion as JiraProjectVersion)
            ctx.currentVersion = null
            ctx.itemType = null
          }
          break

        case 'component':
          if (ctx.currentComponent && ctx.itemType === 'component') {
            result.components.push(ctx.currentComponent as JiraComponent)
            ctx.currentComponent = null
            ctx.itemType = null
          }
          break

        case 'user':
        case 'cwd_user':
          if (ctx.currentUser) {
            if (!ctx.currentUser.username && text) ctx.currentUser.username = text
            if (!ctx.currentUser.displayName && text) ctx.currentUser.displayName = text
            result.users.push(ctx.currentUser as JiraUser)
            ctx.currentUser = null
            ctx.itemType = null
          }
          break

        case 'ao_60db71_sprint':
          if (ctx.currentSprint) {
            result.sprints.push(ctx.currentSprint as JiraSprint)
            ctx.currentSprint = null
            ctx.itemType = null
          }
          break

        case 'board':
        case 'rapidview':
          if (ctx.currentBoard) {
            result.boards.push(ctx.currentBoard as JiraBoard)
            ctx.currentBoard = null
            ctx.itemType = null
          }
          break

        case 'issuelink':
          if (ctx.currentIssueLink) {
            result.issueLinks.push(ctx.currentIssueLink as JiraIssueLink)
            ctx.currentIssueLink = null
            ctx.itemType = null
          }
          break

        case 'customfield':
          if (ctx.currentCustomField && ctx.itemType === 'customfield') {
            result.customFields.push(ctx.currentCustomField as JiraCustomField)
            ctx.currentCustomField = null
            ctx.itemType = null
          }
          break

        default:
          if (ctx.currentProject && ctx.itemType === 'project') {
            switch (lname) {
              case 'name':
                ctx.currentProject.name = text
                break
              case 'description':
                ctx.currentProject.description = text || null
                break
              case 'key':
                ctx.currentProject.key = text
                break
              case 'lead':
                ctx.currentProject.leadKey = text || null
                break
            }
          } else if (ctx.currentVersion && ctx.itemType === 'version') {
            switch (lname) {
              case 'name':
                ctx.currentVersion.name = text
                break
              case 'description':
                ctx.currentVersion.description = text || null
                break
            }
          } else if (ctx.currentComponent && ctx.itemType === 'component') {
            switch (lname) {
              case 'name':
                ctx.currentComponent.name = text
                break
              case 'description':
                ctx.currentComponent.description = text || null
                break
              case 'lead':
                ctx.currentComponent.leadKey = text || null
                break
            }
          } else if (ctx.currentCustomField && ctx.itemType === 'customfield') {
            switch (lname) {
              case 'fieldtype':
              case 'type':
                ctx.currentCustomField.fieldType = text
                break
              case 'name':
                ctx.currentCustomField.name = text
                break
            }
          }
          break
      }
    })

    parser.on('end', () => {
      resolve(result)
    })

    xmlStream.on('error', (err: Error) => {
      reject(err)
    })

    xmlStream.pipe(parser)
  })
}

export async function parseJiraXmlFile(filePath: string): Promise<JiraImportResult> {
  const stream = createReadStream(filePath, { encoding: 'utf8' })
  return parseXmlStream(stream)
}

export async function parseJiraXmlStream(
  stream: NodeJS.ReadableStream,
): Promise<JiraImportResult> {
  return parseXmlStream(stream)
}

export async function parseJiraXmlString(xml: string): Promise<JiraImportResult> {
  const { Readable } = await import('stream')
  const stream = Readable.from([xml])
  return parseXmlStream(stream)
}
