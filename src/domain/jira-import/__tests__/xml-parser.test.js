const { describe, test, expect, beforeEach } = require('@jest/globals')
const { Readable } = require('stream')
const sax = require('sax')

beforeEach(() => jest.clearAllMocks())

function makeReadable(str) {
  return Readable.from([str])
}

function parseXmlString(xml) {
  return new Promise((resolve, reject) => {
    const result = {
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

    const ctx = {
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

    const parser = sax.createStream(false, { lowercase: true, trim: true, normalize: true })

    parser.on('error', (err) => {
      result.parseErrors.push({ entity: 'xml', id: null, message: err.message })
      parser.resume()
    })

    parser.on('opentag', (node) => {
      const name = node.name.toLowerCase()
      const attrs = node.attributes
      ctx.parentStack.push(name)
      ctx.currentElement = name
      ctx.textBuffer = ''
      ctx.currentAttributes = attrs

      if (name === 'item') {
        ctx.currentIssue = {
          id: attrs['id'] || '',
          key: attrs['key'] || '',
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
      } else if (name === 'ao_60db71_sprint') {
        ctx.currentSprint = {
          id: attrs['id'] || '',
          name: attrs['name'] || '',
          state: attrs['state'] || 'FUTURE',
          startDate: attrs['start_date'] || null,
          endDate: attrs['end_date'] || null,
          completeDate: attrs['complete_date'] || null,
          boardId: attrs['rapid_view_id'] || null,
          goal: attrs['goal'] || null,
        }
        ctx.itemType = 'sprint'
      } else if (name === 'nodeassociation') {
        result.nodeAssociations.push({
          sourceNodeId: attrs['sourcenode'] || attrs['source_node_id'] || '',
          sourceNodeEntity: attrs['sourceentity'] || attrs['source_node_entity'] || '',
          sinkNodeId: attrs['sinknode'] || attrs['sink_node_id'] || '',
          sinkNodeEntity: attrs['sinkentity'] || attrs['sink_node_entity'] || '',
          associationType: attrs['associationtype'] || attrs['association_type'] || '',
        })
      } else if (name === 'customfield' && ctx.insideItem) {
        ctx.currentCustomFieldValue = {
          customfieldId: attrs['id'] || '',
          value: null,
        }
      }
    })

    parser.on('text', (text) => { ctx.textBuffer += text })
    parser.on('cdata', (text) => { ctx.textBuffer += text })

    parser.on('closetag', (name) => {
      const lname = name.toLowerCase()
      const text = ctx.textBuffer.trim()
      ctx.textBuffer = ''
      ctx.parentStack.pop()

      if (ctx.insideItem && ctx.currentIssue) {
        if (lname === 'item') {
          ctx.currentIssue.labels = ctx.currentLabels
          ctx.currentIssue.fixVersions = ctx.currentFixVersions
          ctx.currentIssue.components = ctx.currentComponents
          ctx.currentIssue.customFieldValues = ctx.currentCustomFieldValues
          result.issues.push(ctx.currentIssue)
          ctx.currentIssue = null
          ctx.insideItem = false
          ctx.itemType = null
          return
        }
        if (lname === 'customfield') {
          if (ctx.currentCustomFieldValue) {
            ctx.currentCustomFieldValues.push(ctx.currentCustomFieldValue)
            ctx.currentCustomFieldValue = null
          }
          return
        }
        if (lname === 'customfieldvalue' && ctx.currentCustomFieldValue) {
          ctx.currentCustomFieldValue.value = text || null
          return
        }
        switch (lname) {
          case 'summary': ctx.currentIssue.summary = text; break
          case 'description': ctx.currentIssue.description = text || null; break
          case 'type': ctx.currentIssue.issueType = text || 'Story'; break
          case 'status': ctx.currentIssue.status = text || 'Backlog'; break
          case 'priority': ctx.currentIssue.priority = text || null; break
          case 'assignee': ctx.currentIssue.assigneeKey = ctx.currentAttributes['accountid'] || ctx.currentAttributes['key'] || text || null; break
          case 'reporter': ctx.currentIssue.reporterKey = ctx.currentAttributes['accountid'] || ctx.currentAttributes['key'] || text || null; break
          case 'project': ctx.currentIssue.projectKey = ctx.currentAttributes['key'] || text || ''; break
          case 'created': ctx.currentIssue.created = text || null; break
          case 'updated': ctx.currentIssue.updated = text || null; break
          case 'resolved': ctx.currentIssue.resolved = text || null; break
          case 'parent': ctx.currentIssue.parentId = ctx.currentAttributes['id'] || text || null; break
          case 'label': if (text) ctx.currentLabels.push(text); break
          case 'fixversion': if (text) ctx.currentFixVersions.push(text); break
          case 'component': if (text) ctx.currentComponents.push(text); break
        }
        return
      }

      if (lname === 'ao_60db71_sprint' && ctx.currentSprint) {
        result.sprints.push(ctx.currentSprint)
        ctx.currentSprint = null
        ctx.itemType = null
      }
    })

    parser.on('end', () => resolve(result))

    const stream = Readable.from([xml])
    stream.on('error', reject)
    stream.pipe(parser)
  })
}

describe('Jira XML Parser - Issue Parsing', () => {
  test('parses a single issue with basic fields', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="0.92">
  <channel>
    <item id="10001" key="PROJ-1">
      <summary>Fix login bug</summary>
      <type>Bug</type>
      <status>In Progress</status>
      <priority>Critical</priority>
      <project key="PROJ">My Project</project>
      <created>2024-01-01T00:00:00.000Z</created>
    </item>
  </channel>
</rss>`
    const result = await parseXmlString(xml)
    expect(result.issues).toHaveLength(1)
    const issue = result.issues[0]
    expect(issue.id).toBe('10001')
    expect(issue.key).toBe('PROJ-1')
    expect(issue.summary).toBe('Fix login bug')
    expect(issue.issueType).toBe('Bug')
    expect(issue.status).toBe('In Progress')
    expect(issue.priority).toBe('Critical')
    expect(issue.projectKey).toBe('PROJ')
    expect(issue.created).toBe('2024-01-01T00:00:00.000Z')
  })

  test('parses multiple issues from single XML', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="0.92">
  <channel>
    <item id="10001" key="PROJ-1">
      <summary>Story one</summary>
      <type>Story</type>
      <status>Backlog</status>
      <project key="PROJ">Project</project>
    </item>
    <item id="10002" key="PROJ-2">
      <summary>Story two</summary>
      <type>Story</type>
      <status>Done</status>
      <project key="PROJ">Project</project>
    </item>
    <item id="10003" key="PROJ-3">
      <summary>Epic one</summary>
      <type>Epic</type>
      <status>In Progress</status>
      <project key="PROJ">Project</project>
    </item>
  </channel>
</rss>`
    const result = await parseXmlString(xml)
    expect(result.issues).toHaveLength(3)
    expect(result.issues[0].key).toBe('PROJ-1')
    expect(result.issues[1].key).toBe('PROJ-2')
    expect(result.issues[2].issueType).toBe('Epic')
  })

  test('parses issue labels and fix versions', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss>
  <channel>
    <item id="10001" key="PROJ-1">
      <summary>Labeled issue</summary>
      <type>Story</type>
      <status>Backlog</status>
      <project key="PROJ">Project</project>
      <label>backend</label>
      <label>urgent</label>
      <fixVersion>v1.0</fixVersion>
      <fixVersion>v1.1</fixVersion>
    </item>
  </channel>
</rss>`
    const result = await parseXmlString(xml)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].labels).toEqual(['backend', 'urgent'])
    expect(result.issues[0].fixVersions).toEqual(['v1.0', 'v1.1'])
  })

  test('parses issue with assignee and reporter via key attribute', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss>
  <channel>
    <item id="10001" key="PROJ-1">
      <summary>Assigned issue</summary>
      <type>Story</type>
      <status>Backlog</status>
      <project key="PROJ">Project</project>
      <assignee key="jdoe">John Doe</assignee>
      <reporter key="jsmith">Jane Smith</reporter>
    </item>
  </channel>
</rss>`
    const result = await parseXmlString(xml)
    expect(result.issues[0].assigneeKey).toBe('jdoe')
    expect(result.issues[0].reporterKey).toBe('jsmith')
  })

  test('parses issue with custom field values', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss>
  <channel>
    <item id="10001" key="PROJ-1">
      <summary>Story with custom fields</summary>
      <type>Story</type>
      <status>Backlog</status>
      <project key="PROJ">Project</project>
      <customfield id="customfield_10016" key="customfield_10016">
        <customfieldname>Story Points</customfieldname>
        <customfieldvalue>5</customfieldvalue>
      </customfield>
    </item>
  </channel>
</rss>`
    const result = await parseXmlString(xml)
    expect(result.issues[0].customFieldValues).toHaveLength(1)
    expect(result.issues[0].customFieldValues[0].customfieldId).toBe('customfield_10016')
    expect(result.issues[0].customFieldValues[0].value).toBe('5')
  })

  test('handles issue with missing optional fields gracefully', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss>
  <channel>
    <item id="10001" key="PROJ-1">
      <summary>Minimal issue</summary>
      <project key="PROJ">Project</project>
    </item>
  </channel>
</rss>`
    const result = await parseXmlString(xml)
    expect(result.issues).toHaveLength(1)
    const issue = result.issues[0]
    expect(issue.description).toBeNull()
    expect(issue.priority).toBeNull()
    expect(issue.assigneeKey).toBeNull()
    expect(issue.reporterKey).toBeNull()
    expect(issue.labels).toEqual([])
    expect(issue.fixVersions).toEqual([])
    expect(issue.customFieldValues).toEqual([])
  })
})

describe('Jira XML Parser - Sprint Parsing', () => {
  test('parses sprint from AO_60DB71_SPRINT element', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<entity-engine-xml>
  <AO_60DB71_SPRINT id="1" name="Sprint 1" state="ACTIVE"
    start_date="2024-01-01T00:00:00.000Z"
    end_date="2024-01-14T00:00:00.000Z"
    rapid_view_id="2"
    goal="Complete login feature" />
</entity-engine-xml>`
    const result = await parseXmlString(xml)
    expect(result.sprints).toHaveLength(1)
    const sprint = result.sprints[0]
    expect(sprint.id).toBe('1')
    expect(sprint.name).toBe('Sprint 1')
    expect(sprint.state).toBe('ACTIVE')
    expect(sprint.startDate).toBe('2024-01-01T00:00:00.000Z')
    expect(sprint.endDate).toBe('2024-01-14T00:00:00.000Z')
    expect(sprint.boardId).toBe('2')
    expect(sprint.goal).toBe('Complete login feature')
  })

  test('parses multiple sprints', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<entity-engine-xml>
  <AO_60DB71_SPRINT id="1" name="Sprint 1" state="CLOSED" />
  <AO_60DB71_SPRINT id="2" name="Sprint 2" state="ACTIVE" />
  <AO_60DB71_SPRINT id="3" name="Sprint 3" state="FUTURE" />
</entity-engine-xml>`
    const result = await parseXmlString(xml)
    expect(result.sprints).toHaveLength(3)
    expect(result.sprints[0].state).toBe('CLOSED')
    expect(result.sprints[1].state).toBe('ACTIVE')
    expect(result.sprints[2].state).toBe('FUTURE')
  })
})

describe('Jira XML Parser - Node Association Parsing', () => {
  test('parses node associations', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<entity-engine-xml>
  <NodeAssociation sourceNode="10001" sourceEntity="Issue"
    sinkNode="1" sinkEntity="AO_60DB71_SPRINT"
    associationType="IssueInSprint" />
  <NodeAssociation sourceNode="10002" sourceEntity="Issue"
    sinkNode="1" sinkEntity="AO_60DB71_SPRINT"
    associationType="IssueInSprint" />
</entity-engine-xml>`
    const result = await parseXmlString(xml)
    expect(result.nodeAssociations).toHaveLength(2)
    expect(result.nodeAssociations[0].sourceNodeId).toBe('10001')
    expect(result.nodeAssociations[0].sinkNodeId).toBe('1')
    expect(result.nodeAssociations[0].associationType).toBe('IssueInSprint')
  })

  test('parses node associations with alternate attribute names', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<entity-engine-xml>
  <NodeAssociation source_node_id="10001" source_node_entity="Issue"
    sink_node_id="2" sink_node_entity="Sprint"
    association_type="SprintIssue" />
</entity-engine-xml>`
    const result = await parseXmlString(xml)
    expect(result.nodeAssociations).toHaveLength(1)
    expect(result.nodeAssociations[0].sourceNodeId).toBe('10001')
    expect(result.nodeAssociations[0].sinkNodeId).toBe('2')
  })
})

describe('Jira XML Parser - Error Handling', () => {
  test('continues parsing after malformed XML and records error', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss>
  <channel>
    <item id="10001" key="PROJ-1">
      <summary>Valid issue</summary>
      <type>Story</type>
      <status>Backlog</status>
      <project key="PROJ">Project</project>
    </item>
  </channel>
</rss>`
    const result = await parseXmlString(xml)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].summary).toBe('Valid issue')
  })

  test('returns empty result for empty XML', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><rss></rss>`
    const result = await parseXmlString(xml)
    expect(result.issues).toHaveLength(0)
    expect(result.projects).toHaveLength(0)
    expect(result.sprints).toHaveLength(0)
  })

  test('result has all required entity arrays initialized', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><rss></rss>`
    const result = await parseXmlString(xml)
    expect(Array.isArray(result.issues)).toBe(true)
    expect(Array.isArray(result.projects)).toBe(true)
    expect(Array.isArray(result.versions)).toBe(true)
    expect(Array.isArray(result.components)).toBe(true)
    expect(Array.isArray(result.users)).toBe(true)
    expect(Array.isArray(result.sprints)).toBe(true)
    expect(Array.isArray(result.boards)).toBe(true)
    expect(Array.isArray(result.issueLinks)).toBe(true)
    expect(Array.isArray(result.nodeAssociations)).toBe(true)
    expect(Array.isArray(result.customFields)).toBe(true)
    expect(Array.isArray(result.parseErrors)).toBe(true)
  })
})

describe('Jira XML Parser - CDATA handling', () => {
  test('handles CDATA sections in description', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss>
  <channel>
    <item id="10001" key="PROJ-1">
      <summary>Issue with CDATA</summary>
      <description><![CDATA[This is a <b>rich</b> description with special chars: & < >]]></description>
      <type>Story</type>
      <status>Backlog</status>
      <project key="PROJ">Project</project>
    </item>
  </channel>
</rss>`
    const result = await parseXmlString(xml)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].description).toContain('rich')
    expect(result.issues[0].description).toContain('special chars')
  })

  test('handles CDATA in summary', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss>
  <channel>
    <item id="10001" key="PROJ-1">
      <summary><![CDATA[Summary with <special> chars]]></summary>
      <type>Story</type>
      <status>Backlog</status>
      <project key="PROJ">Project</project>
    </item>
  </channel>
</rss>`
    const result = await parseXmlString(xml)
    expect(result.issues[0].summary).toContain('special')
  })
})

describe('Jira XML Parser - Issue type and status defaults', () => {
  test('defaults issueType to Story when not provided', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss>
  <channel>
    <item id="10001" key="PROJ-1">
      <summary>No type issue</summary>
      <project key="PROJ">Project</project>
    </item>
  </channel>
</rss>`
    const result = await parseXmlString(xml)
    expect(result.issues[0].issueType).toBe('Story')
  })

  test('defaults status to Backlog when not provided', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss>
  <channel>
    <item id="10001" key="PROJ-1">
      <summary>No status issue</summary>
      <project key="PROJ">Project</project>
    </item>
  </channel>
</rss>`
    const result = await parseXmlString(xml)
    expect(result.issues[0].status).toBe('Backlog')
  })

  test('correctly identifies Epic issue type', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss>
  <channel>
    <item id="10001" key="PROJ-E1">
      <summary>An Epic</summary>
      <type>Epic</type>
      <status>In Progress</status>
      <project key="PROJ">Project</project>
    </item>
  </channel>
</rss>`
    const result = await parseXmlString(xml)
    expect(result.issues[0].issueType).toBe('Epic')
  })
})

describe('Jira XML Parser - Large payload simulation', () => {
  test('handles 100 issues without dropping any', async () => {
    const items = Array.from({ length: 100 }, (_, i) =>
      `<item id="${10000 + i}" key="PROJ-${i + 1}">
        <summary>Issue number ${i + 1}</summary>
        <type>Story</type>
        <status>Backlog</status>
        <project key="PROJ">Project</project>
      </item>`
    ).join('\n')

    const xml = `<?xml version="1.0" encoding="UTF-8"?><rss><channel>${items}</channel></rss>`
    const result = await parseXmlString(xml)
    expect(result.issues).toHaveLength(100)
    expect(result.issues[0].summary).toBe('Issue number 1')
    expect(result.issues[99].summary).toBe('Issue number 100')
  })

  test('correctly processes mixed entity types in one document', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<entity-engine-xml>
  <AO_60DB71_SPRINT id="1" name="Sprint 1" state="ACTIVE" />
  <AO_60DB71_SPRINT id="2" name="Sprint 2" state="FUTURE" />
  <NodeAssociation sourceNode="10001" sourceEntity="Issue"
    sinkNode="1" sinkEntity="Sprint" associationType="IssueInSprint" />
  <NodeAssociation sourceNode="10002" sourceEntity="Issue"
    sinkNode="1" sinkEntity="Sprint" associationType="IssueInSprint" />
</entity-engine-xml>`
    const result = await parseXmlString(xml)
    expect(result.sprints).toHaveLength(2)
    expect(result.nodeAssociations).toHaveLength(2)
  })
})
