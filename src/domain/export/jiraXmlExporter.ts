import type { Epic, Feature, Story, Task, Milestone, Workstream } from '@/app/generated/prisma'

export interface JiraXmlExportData {
  projectKey: string
  projectName: string
  projectDescription: string | null
  epics: (Epic & { features: (Feature & { stories: (Story & { tasks: Task[] })[] })[] })[]
  orphanStories: (Story & { tasks: Task[] })[]
  milestones: Milestone[]
  workstreams: Workstream[]
  sprints: SprintExportRow[]
  sprintStories: SprintStoryRow[]
}

export interface SprintExportRow {
  id: string
  name: string
  state: 'ACTIVE' | 'CLOSED' | 'FUTURE'
  startDate: Date | null
  endDate: Date | null
  completeDate: Date | null
  goal: string | null
  boardId: string
}

export interface SprintStoryRow {
  sprintId: string
  storyId: string
}

const ISSUETYPE_MAP: Record<string, string> = {
  backlog: 'Story',
  active: 'Story',
  done: 'Story',
}

const PRIORITY_MAP: Record<string, string> = {
  critical: 'Blocker',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

const STATUS_MAP: Record<string, string> = {
  backlog: 'To Do',
  active: 'In Progress',
  done: 'Done',
}

function esc(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function isoDate(d: Date | null | undefined): string {
  if (!d) return ''
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString()
}

function issueXml(
  issue: Story & { tasks?: Task[] },
  issuetype: string,
  issueNum: number,
  projectKey: string,
  epicKey: string | null,
): string {
  const pkey = `${projectKey}-${issueNum}`
  const status = STATUS_MAP[issue.status] ?? 'To Do'
  const priority = PRIORITY_MAP[(issue as unknown as Record<string, string>)['priority'] ?? 'medium'] ?? 'Medium'
  const epicLinkField = epicKey
    ? `<customfieldvalue customfieldId="customfield_10014" key="${esc(epicKey)}"/>`
    : ''
  return `    <item>
      <key id="${esc(issue.id)}">${esc(pkey)}</key>
      <summary>${esc(issue.title)}</summary>
      <issuetype>${esc(issuetype)}</issuetype>
      <status>${esc(status)}</status>
      <priority>${esc(priority)}</priority>
      <created>${isoDate((issue as unknown as Record<string, Date>)['createdAt'])}</created>
      <updated>${isoDate((issue as unknown as Record<string, Date>)['updatedAt'])}</updated>
      ${epicLinkField}
    </item>`
}

function epicXml(epic: Epic, epicNum: number, projectKey: string): string {
  const pkey = `${projectKey}-${epicNum}`
  const status = STATUS_MAP[epic.status] ?? 'To Do'
  const priority = PRIORITY_MAP[(epic as unknown as Record<string, string>)['priority'] ?? 'medium'] ?? 'Medium'
  return `    <item>
      <key id="${esc(epic.id)}">${esc(pkey)}</key>
      <summary>${esc(epic.title)}</summary>
      <issuetype>Epic</issuetype>
      <status>${esc(status)}</status>
      <priority>${esc(priority)}</priority>
      <customfieldvalue customfieldId="customfield_10011">${esc(epic.title)}</customfieldvalue>
      <created>${isoDate((epic as unknown as Record<string, Date>)['createdAt'])}</created>
      <updated>${isoDate((epic as unknown as Record<string, Date>)['updatedAt'])}</updated>
    </item>`
}

function sprintXml(sprint: SprintExportRow, idx: number): string {
  return `  <AO_60DB71_SPRINT id="${esc(sprint.id)}" SEQUENCE="${idx}">
    <NAME>${esc(sprint.name)}</NAME>
    <STATE>${esc(sprint.state)}</STATE>
    <START_DATE>${isoDate(sprint.startDate)}</START_DATE>
    <END_DATE>${isoDate(sprint.endDate)}</END_DATE>
    <COMPLETE_DATE>${isoDate(sprint.completeDate)}</COMPLETE_DATE>
    <GOAL>${esc(sprint.goal ?? '')}</GOAL>
    <RAPID_VIEW_ID>${esc(sprint.boardId)}</RAPID_VIEW_ID>
  </AO_60DB71_SPRINT>`
}

function boardXml(projectKey: string, workstreams: Workstream[]): string {
  const columns = workstreams.length > 0
    ? workstreams.map((w, i) =>
        `    <column id="${i + 1}" name="${esc(w.name)}" statusIds="10000"/>`
      ).join('\n')
    : `    <column id="1" name="To Do" statusIds="10000"/>
    <column id="2" name="In Progress" statusIds="10001"/>
    <column id="3" name="Done" statusIds="10002"/>`

  return `  <AO_60DB71_RAPIDVIEW id="1">
    <NAME>${esc(projectKey)} Board</NAME>
    <QUERY>project = ${esc(projectKey)}</QUERY>
    <COLUMN_CONFIG>
${columns}
    </COLUMN_CONFIG>
  </AO_60DB71_RAPIDVIEW>`
}

export function serializeProjectAsJiraXml(data: JiraXmlExportData): string {
  const { projectKey, projectName, projectDescription, epics, orphanStories, milestones, workstreams, sprints, sprintStories } = data
  let issueNum = 1
  const issueItems: string[] = []
  const epicKeyMap = new Map<string, string>()

  for (const epic of epics) {
    const epicKey = `${projectKey}-${issueNum}`
    epicKeyMap.set(epic.id, epicKey)
    issueItems.push(epicXml(epic, issueNum, projectKey))
    issueNum++

    for (const feature of epic.features) {
      for (const story of feature.stories) {
        issueItems.push(issueXml(story, ISSUETYPE_MAP[story.status] ?? 'Story', issueNum, projectKey, epicKey))
        issueNum++
      }
    }
    for (const story of ((epic as unknown as Record<string, unknown>)['stories'] as (Story & { tasks: Task[] })[] | undefined) ?? []) {
      issueItems.push(issueXml(story, 'Story', issueNum, projectKey, epicKey))
      issueNum++
    }
  }

  for (const story of orphanStories) {
    issueItems.push(issueXml(story, 'Story', issueNum, projectKey, null))
    issueNum++
  }

  const versionXml = milestones.map((m, i) => `  <Version id="${i + 1}" sequence="${i}">
    <name>${esc(m.title)}</name>
    <released>${String((m as unknown as Record<string, unknown>)['released'] ?? false)}</released>
  </Version>`).join('\n')

  const sprintBlocks = sprints.map((s, i) => sprintXml(s, i)).join('\n')
  const nodeAssoc = sprintStories.map(ss =>
    `  <NodeAssociation sourceNodeId="${esc(ss.sprintId)}" sourceNodeEntity="Sprint" sinkNodeId="${esc(ss.storyId)}" sinkNodeEntity="Issue" associationType="IssueInSprint"/>`
  ).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<backup xmlns="http://www.atlassian.com/jira/backup/1.0">
  <Project id="1" key="${esc(projectKey)}" name="${esc(projectName)}" description="${esc(projectDescription ?? '')}"/>
${versionXml}
  <Issues>
${issueItems.join('\n')}
  </Issues>
${sprintBlocks}
${boardXml(projectKey, workstreams)}
${nodeAssoc}
</backup>`
}
