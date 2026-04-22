const { describe, test, expect, beforeEach } = require('@jest/globals')

beforeEach(() => jest.clearAllMocks())

// ── Inline the domain logic under test ──────────────────────────────────────

const EPIC_TYPES = new Set(['Epic', 'epic', 'EPIC'])

function isEpicIssueType(issuetype) {
  return EPIC_TYPES.has(issuetype) || issuetype.toLowerCase() === 'epic'
}

function parseDate(value) {
  if (value === null || value.trim() === '') return null
  const parsed = new Date(value)
  if (isNaN(parsed.getTime())) return null
  return parsed
}

const STATUS_MAP = {
  'To Do': 'backlog',
  'Backlog': 'backlog',
  'Open': 'backlog',
  'Reopened': 'backlog',
  'Selected for Development': 'backlog',
  'Ready for Development': 'backlog',
  'In Progress': 'active',
  'In Development': 'active',
  'In Review': 'active',
  'Code Review': 'active',
  'Testing': 'active',
  'QA': 'active',
  'Done': 'done',
  'Closed': 'done',
  'Resolved': 'done',
  'Released': 'done',
  'Blocked': 'blocked',
  'Impediment': 'blocked',
}

const PRIORITY_MAP = {
  'Highest': 'critical',
  'Critical': 'critical',
  'Blocker': 'critical',
  'High': 'high',
  'Major': 'high',
  'Medium': 'medium',
  'Normal': 'medium',
  'Minor': 'low',
  'Low': 'low',
  'Lowest': 'low',
  'Trivial': 'low',
}

function normalizeStatus(jiraStatus) {
  const normalized = STATUS_MAP[jiraStatus]
  if (normalized !== undefined) return normalized
  const lower = jiraStatus.toLowerCase()
  if (lower.includes('progress') || lower.includes('active') || lower.includes('review')) return 'active'
  if (lower.includes('done') || lower.includes('closed') || lower.includes('resolved')) return 'done'
  if (lower.includes('block') || lower.includes('impediment')) return 'blocked'
  return 'backlog'
}

function normalizePriority(jiraPriority) {
  if (jiraPriority === null) return 'medium'
  const normalized = PRIORITY_MAP[jiraPriority]
  if (normalized !== undefined) return normalized
  const lower = jiraPriority.toLowerCase()
  if (lower.includes('critical') || lower.includes('highest') || lower.includes('blocker')) return 'critical'
  if (lower.includes('high') || lower.includes('major')) return 'high'
  if (lower.includes('low') || lower.includes('minor') || lower.includes('trivial')) return 'low'
  return 'medium'
}

function lookupStoryPoints(issueId, customFieldValues, storyPointsFieldId) {
  const field = customFieldValues.find(
    (cfv) => cfv.issue === issueId && cfv.customfield === storyPointsFieldId,
  )
  if (field === undefined) return null
  if (field.numbervalue !== null && isFinite(field.numbervalue)) return field.numbervalue
  if (field.stringvalue !== null && field.stringvalue.trim() !== '') {
    const parsed = parseFloat(field.stringvalue)
    if (!isNaN(parsed) && isFinite(parsed)) return parsed
  }
  return null
}

function lookupEpicName(issueId, customFieldValues, epicNameFieldId) {
  const field = customFieldValues.find(
    (cfv) => cfv.issue === issueId && cfv.customfield === epicNameFieldId,
  )
  if (field === undefined) return null
  if (field.stringvalue !== null && field.stringvalue.trim() !== '') return field.stringvalue.trim()
  if (field.textvalue !== null && field.textvalue.trim() !== '') return field.textvalue.trim()
  return null
}

function lookupEpicLinkId(issueId, customFieldValues, epicLinkFieldId, issueRow) {
  if (issueRow.epic_link_id !== null) return issueRow.epic_link_id
  const field = customFieldValues.find(
    (cfv) => cfv.issue === issueId && cfv.customfield === epicLinkFieldId,
  )
  if (field === undefined) return null
  if (field.numbervalue !== null && isFinite(field.numbervalue)) return Math.round(field.numbervalue)
  if (field.stringvalue !== null) {
    const parsed = parseInt(field.stringvalue, 10)
    if (!isNaN(parsed)) return parsed
  }
  return null
}

function adaptJiraIssue(row, context) {
  const { customFieldValues, fieldMapping } = context
  const storyPoints = lookupStoryPoints(row.id, customFieldValues, fieldMapping.storyPointsFieldId)

  if (isEpicIssueType(row.issuetype)) {
    const epicName = lookupEpicName(row.id, customFieldValues, fieldMapping.epicNameFieldId)
    return {
      kind: 'epic',
      jiraId: row.id,
      pkey: row.pkey,
      projectId: row.project,
      issueNum: row.issuenum,
      title: row.summary.trim(),
      description: row.description !== null && row.description.trim() !== '' ? row.description.trim() : null,
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

  const epicLinkId = lookupEpicLinkId(row.id, customFieldValues, fieldMapping.epicLinkFieldId, row)
  return {
    kind: 'story',
    jiraId: row.id,
    pkey: row.pkey,
    projectId: row.project,
    issueNum: row.issuenum,
    title: row.summary.trim(),
    description: row.description !== null && row.description.trim() !== '' ? row.description.trim() : null,
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

function adaptJiraIssues(rows, context) {
  return rows.map((row) => adaptJiraIssue(row, context))
}

// ── Test fixtures ────────────────────────────────────────────────────────────

const DEFAULT_FIELD_MAPPING = {
  storyPointsFieldId: 10016,
  epicLinkFieldId: 10014,
  epicNameFieldId: 10011,
  sprintFieldId: 10020,
}

function makeStoryRow(overrides = {}) {
  return {
    id: 1001,
    issuenum: 42,
    project: 10000,
    summary: 'Implement login feature',
    description: 'As a user I want to log in',
    issuetype: 'Story',
    status: 'To Do',
    priority: 'High',
    assignee: 'jsmith',
    reporter: 'jdoe',
    created: '2024-01-15T10:00:00.000Z',
    updated: '2024-01-16T12:00:00.000Z',
    duedate: null,
    resolutiondate: null,
    timeoriginalestimate: null,
    timeestimate: null,
    timespent: null,
    pkey: 'PROJ-42',
    epic_link_id: null,
    parent_id: null,
    ...overrides,
  }
}

function makeEpicRow(overrides = {}) {
  return makeStoryRow({
    id: 2001,
    issuenum: 1,
    summary: 'Authentication Epic',
    issuetype: 'Epic',
    pkey: 'PROJ-1',
    ...overrides,
  })
}

function makeCustomFieldValue(overrides = {}) {
  return {
    id: 9001,
    issue: 1001,
    customfield: 10016,
    stringvalue: null,
    numbervalue: null,
    datevalue: null,
    textvalue: null,
    ...overrides,
  }
}

const EMPTY_CONTEXT = {
  customFieldValues: [],
  fieldMapping: DEFAULT_FIELD_MAPPING,
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('adaptJiraIssue — Story type', () => {
  test('produces kind=story for Story issuetype', () => {
    const result = adaptJiraIssue(makeStoryRow(), EMPTY_CONTEXT)
    expect(result.kind).toBe('story')
  })

  test('maps all core fields correctly', () => {
    const row = makeStoryRow()
    const result = adaptJiraIssue(row, EMPTY_CONTEXT)
    expect(result.jiraId).toBe(1001)
    expect(result.pkey).toBe('PROJ-42')
    expect(result.projectId).toBe(10000)
    expect(result.issueNum).toBe(42)
    expect(result.title).toBe('Implement login feature')
    expect(result.description).toBe('As a user I want to log in')
    expect(result.assignee).toBe('jsmith')
    expect(result.reporter).toBe('jdoe')
  })

  test('sets storyPoints to null when no customfieldvalue row exists', () => {
    const result = adaptJiraIssue(makeStoryRow(), EMPTY_CONTEXT)
    expect(result.storyPoints).toBeNull()
  })

  test('reads story points from numbervalue', () => {
    const context = {
      customFieldValues: [
        makeCustomFieldValue({ issue: 1001, customfield: 10016, numbervalue: 5 }),
      ],
      fieldMapping: DEFAULT_FIELD_MAPPING,
    }
    const result = adaptJiraIssue(makeStoryRow(), context)
    expect(result.storyPoints).toBe(5)
  })

  test('reads story points from stringvalue when numbervalue is null', () => {
    const context = {
      customFieldValues: [
        makeCustomFieldValue({ issue: 1001, customfield: 10016, numbervalue: null, stringvalue: '8' }),
      ],
      fieldMapping: DEFAULT_FIELD_MAPPING,
    }
    const result = adaptJiraIssue(makeStoryRow(), context)
    expect(result.storyPoints).toBe(8)
  })

  test('returns null story points when stringvalue is non-numeric', () => {
    const context = {
      customFieldValues: [
        makeCustomFieldValue({ issue: 1001, customfield: 10016, numbervalue: null, stringvalue: 'N/A' }),
      ],
      fieldMapping: DEFAULT_FIELD_MAPPING,
    }
    const result = adaptJiraIssue(makeStoryRow(), context)
    expect(result.storyPoints).toBeNull()
  })

  test('ignores customfieldvalue for different issue id', () => {
    const context = {
      customFieldValues: [
        makeCustomFieldValue({ issue: 9999, customfield: 10016, numbervalue: 13 }),
      ],
      fieldMapping: DEFAULT_FIELD_MAPPING,
    }
    const result = adaptJiraIssue(makeStoryRow(), context)
    expect(result.storyPoints).toBeNull()
  })

  test('ignores customfieldvalue for different customfield id', () => {
    const context = {
      customFieldValues: [
        makeCustomFieldValue({ issue: 1001, customfield: 99999, numbervalue: 13 }),
      ],
      fieldMapping: DEFAULT_FIELD_MAPPING,
    }
    const result = adaptJiraIssue(makeStoryRow(), context)
    expect(result.storyPoints).toBeNull()
  })

  test('prefers numbervalue over stringvalue when both present', () => {
    const context = {
      customFieldValues: [
        makeCustomFieldValue({ issue: 1001, customfield: 10016, numbervalue: 3, stringvalue: '99' }),
      ],
      fieldMapping: DEFAULT_FIELD_MAPPING,
    }
    const result = adaptJiraIssue(makeStoryRow(), context)
    expect(result.storyPoints).toBe(3)
  })

  test('reads epic link from epic_link_id column when present', () => {
    const row = makeStoryRow({ epic_link_id: 2001 })
    const result = adaptJiraIssue(row, EMPTY_CONTEXT)
    expect(result.epicLinkId).toBe(2001)
  })

  test('reads epic link from customfieldvalue when epic_link_id is null', () => {
    const context = {
      customFieldValues: [
        makeCustomFieldValue({ issue: 1001, customfield: 10014, numbervalue: 3000 }),
      ],
      fieldMapping: DEFAULT_FIELD_MAPPING,
    }
    const result = adaptJiraIssue(makeStoryRow({ epic_link_id: null }), context)
    expect(result.epicLinkId).toBe(3000)
  })

  test('epic_link_id column takes precedence over customfieldvalue', () => {
    const context = {
      customFieldValues: [
        makeCustomFieldValue({ issue: 1001, customfield: 10014, numbervalue: 9999 }),
      ],
      fieldMapping: DEFAULT_FIELD_MAPPING,
    }
    const result = adaptJiraIssue(makeStoryRow({ epic_link_id: 2001 }), context)
    expect(result.epicLinkId).toBe(2001)
  })

  test('sets epicLinkId to null when no source exists', () => {
    const result = adaptJiraIssue(makeStoryRow({ epic_link_id: null }), EMPTY_CONTEXT)
    expect(result.epicLinkId).toBeNull()
  })

  test('sets parentId from parent_id column', () => {
    const row = makeStoryRow({ parent_id: 500 })
    const result = adaptJiraIssue(row, EMPTY_CONTEXT)
    expect(result.parentId).toBe(500)
  })

  test('trims whitespace from summary', () => {
    const row = makeStoryRow({ summary: '  My Story  ' })
    const result = adaptJiraIssue(row, EMPTY_CONTEXT)
    expect(result.title).toBe('My Story')
  })

  test('sets description to null when empty string', () => {
    const row = makeStoryRow({ description: '' })
    const result = adaptJiraIssue(row, EMPTY_CONTEXT)
    expect(result.description).toBeNull()
  })

  test('sets description to null when whitespace only', () => {
    const row = makeStoryRow({ description: '   ' })
    const result = adaptJiraIssue(row, EMPTY_CONTEXT)
    expect(result.description).toBeNull()
  })

  test('sets description to null when row.description is null', () => {
    const row = makeStoryRow({ description: null })
    const result = adaptJiraIssue(row, EMPTY_CONTEXT)
    expect(result.description).toBeNull()
  })

  test('parses createdAt and updatedAt as Date objects', () => {
    const result = adaptJiraIssue(makeStoryRow(), EMPTY_CONTEXT)
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
    expect(result.createdAt.toISOString()).toBe('2024-01-15T10:00:00.000Z')
  })

  test('sets dueDate to null when duedate is null', () => {
    const result = adaptJiraIssue(makeStoryRow({ duedate: null }), EMPTY_CONTEXT)
    expect(result.dueDate).toBeNull()
  })

  test('parses dueDate when present', () => {
    const result = adaptJiraIssue(makeStoryRow({ duedate: '2024-03-01T00:00:00.000Z' }), EMPTY_CONTEXT)
    expect(result.dueDate).toBeInstanceOf(Date)
  })

  test('sets resolvedAt to null when resolutiondate is null', () => {
    const result = adaptJiraIssue(makeStoryRow(), EMPTY_CONTEXT)
    expect(result.resolvedAt).toBeNull()
  })
})

describe('adaptJiraIssue — Epic type', () => {
  test('produces kind=epic for Epic issuetype', () => {
    const result = adaptJiraIssue(makeEpicRow(), EMPTY_CONTEXT)
    expect(result.kind).toBe('epic')
  })

  test('produces kind=epic for lowercase epic issuetype', () => {
    const result = adaptJiraIssue(makeEpicRow({ issuetype: 'epic' }), EMPTY_CONTEXT)
    expect(result.kind).toBe('epic')
  })

  test('produces kind=epic for EPIC uppercase issuetype', () => {
    const result = adaptJiraIssue(makeEpicRow({ issuetype: 'EPIC' }), EMPTY_CONTEXT)
    expect(result.kind).toBe('epic')
  })

  test('maps core epic fields', () => {
    const result = adaptJiraIssue(makeEpicRow(), EMPTY_CONTEXT)
    expect(result.jiraId).toBe(2001)
    expect(result.pkey).toBe('PROJ-1')
    expect(result.issueNum).toBe(1)
    expect(result.title).toBe('Authentication Epic')
  })

  test('sets epicName to null when no customfieldvalue exists', () => {
    const result = adaptJiraIssue(makeEpicRow(), EMPTY_CONTEXT)
    expect(result.epicName).toBeNull()
  })

  test('reads epicName from stringvalue of epic name field', () => {
    const context = {
      customFieldValues: [
        makeCustomFieldValue({ issue: 2001, customfield: 10011, stringvalue: 'Auth Epic Name' }),
      ],
      fieldMapping: DEFAULT_FIELD_MAPPING,
    }
    const result = adaptJiraIssue(makeEpicRow(), context)
    expect(result.epicName).toBe('Auth Epic Name')
  })

  test('reads epicName from textvalue when stringvalue is null', () => {
    const context = {
      customFieldValues: [
        makeCustomFieldValue({ issue: 2001, customfield: 10011, stringvalue: null, textvalue: 'My Epic Text' }),
      ],
      fieldMapping: DEFAULT_FIELD_MAPPING,
    }
    const result = adaptJiraIssue(makeEpicRow(), context)
    expect(result.epicName).toBe('My Epic Text')
  })

  test('does not have epicLinkId or parentId on epic output', () => {
    const result = adaptJiraIssue(makeEpicRow(), EMPTY_CONTEXT)
    expect('epicLinkId' in result).toBe(false)
    expect('parentId' in result).toBe(false)
  })

  test('reads story points for epics too', () => {
    const context = {
      customFieldValues: [
        makeCustomFieldValue({ issue: 2001, customfield: 10016, numbervalue: 40 }),
      ],
      fieldMapping: DEFAULT_FIELD_MAPPING,
    }
    const result = adaptJiraIssue(makeEpicRow(), context)
    expect(result.storyPoints).toBe(40)
  })
})

describe('normalizeStatus', () => {
  test.each([
    ['To Do', 'backlog'],
    ['Backlog', 'backlog'],
    ['Open', 'backlog'],
    ['In Progress', 'active'],
    ['In Review', 'active'],
    ['Code Review', 'active'],
    ['Testing', 'active'],
    ['Done', 'done'],
    ['Closed', 'done'],
    ['Resolved', 'done'],
    ['Blocked', 'blocked'],
    ['Impediment', 'blocked'],
  ])('maps %s → %s', (jiraStatus, expected) => {
    expect(normalizeStatus(jiraStatus)).toBe(expected)
  })

  test('falls back to active for unknown status containing progress', () => {
    expect(normalizeStatus('Custom In Progress State')).toBe('active')
  })

  test('falls back to done for unknown status containing resolved', () => {
    expect(normalizeStatus('Partially Resolved')).toBe('done')
  })

  test('falls back to blocked for unknown status containing block', () => {
    expect(normalizeStatus('Hard Blocked')).toBe('blocked')
  })

  test('falls back to backlog for completely unknown status', () => {
    expect(normalizeStatus('Funky Custom Status')).toBe('backlog')
  })
})

describe('normalizePriority', () => {
  test.each([
    ['Highest', 'critical'],
    ['Critical', 'critical'],
    ['Blocker', 'critical'],
    ['High', 'high'],
    ['Major', 'high'],
    ['Medium', 'medium'],
    ['Normal', 'medium'],
    ['Low', 'low'],
    ['Lowest', 'low'],
    ['Minor', 'low'],
    ['Trivial', 'low'],
  ])('maps %s → %s', (jiraPriority, expected) => {
    expect(normalizePriority(jiraPriority)).toBe(expected)
  })

  test('returns medium when priority is null', () => {
    expect(normalizePriority(null)).toBe('medium')
  })

  test('falls back to medium for unknown priority', () => {
    expect(normalizePriority('Unknown')).toBe('medium')
  })

  test('falls back to critical for unknown containing critical', () => {
    expect(normalizePriority('Super Critical')).toBe('critical')
  })
})

describe('adaptJiraIssues — batch', () => {
  test('returns empty array for empty input', () => {
    const result = adaptJiraIssues([], EMPTY_CONTEXT)
    expect(result).toEqual([])
  })

  test('adapts multiple rows correctly', () => {
    const rows = [
      makeStoryRow({ id: 1, pkey: 'PROJ-1', issuetype: 'Story' }),
      makeStoryRow({ id: 2, pkey: 'PROJ-2', issuetype: 'Epic' }),
      makeStoryRow({ id: 3, pkey: 'PROJ-3', issuetype: 'Story' }),
    ]
    const result = adaptJiraIssues(rows, EMPTY_CONTEXT)
    expect(result).toHaveLength(3)
    expect(result[0].kind).toBe('story')
    expect(result[1].kind).toBe('epic')
    expect(result[2].kind).toBe('story')
  })

  test('resolves story points per-issue from shared customFieldValues array', () => {
    const rows = [
      makeStoryRow({ id: 101, pkey: 'PROJ-101', issuetype: 'Story' }),
      makeStoryRow({ id: 102, pkey: 'PROJ-102', issuetype: 'Story' }),
    ]
    const context = {
      customFieldValues: [
        makeCustomFieldValue({ issue: 101, customfield: 10016, numbervalue: 3 }),
        makeCustomFieldValue({ issue: 102, customfield: 10016, numbervalue: 8 }),
      ],
      fieldMapping: DEFAULT_FIELD_MAPPING,
    }
    const result = adaptJiraIssues(rows, context)
    expect(result[0].storyPoints).toBe(3)
    expect(result[1].storyPoints).toBe(8)
  })

  test('mixed story and epic rows each resolve their own epicName/epicLinkId', () => {
    const epicRow = makeEpicRow({ id: 200, pkey: 'PROJ-200' })
    const storyRow = makeStoryRow({ id: 201, pkey: 'PROJ-201', epic_link_id: 200 })
    const context = {
      customFieldValues: [
        makeCustomFieldValue({ issue: 200, customfield: 10011, stringvalue: 'My Epic' }),
      ],
      fieldMapping: DEFAULT_FIELD_MAPPING,
    }
    const result = adaptJiraIssues([epicRow, storyRow], context)
    const epic = result[0]
    const story = result[1]
    expect(epic.kind).toBe('epic')
    expect(epic.epicName).toBe('My Epic')
    expect(story.kind).toBe('story')
    expect(story.epicLinkId).toBe(200)
  })
})

describe('parseDate edge cases', () => {
  test('returns null for empty string', () => {
    expect(parseDate('')).toBeNull()
  })

  test('returns null for whitespace-only string', () => {
    expect(parseDate('   ')).toBeNull()
  })

  test('returns null for null input', () => {
    expect(parseDate(null)).toBeNull()
  })

  test('returns null for invalid date string', () => {
    expect(parseDate('not-a-date')).toBeNull()
  })

  test('returns Date for valid ISO string', () => {
    const result = parseDate('2024-06-15T08:00:00.000Z')
    expect(result).toBeInstanceOf(Date)
    expect(result.toISOString()).toBe('2024-06-15T08:00:00.000Z')
  })
})

describe('lookupStoryPoints edge cases', () => {
  test('returns null when customFieldValues is empty', () => {
    const result = lookupStoryPoints(1, [], 10016)
    expect(result).toBeNull()
  })

  test('handles fractional story points from numbervalue', () => {
    const cfv = [makeCustomFieldValue({ issue: 1, customfield: 10016, numbervalue: 0.5 })]
    expect(lookupStoryPoints(1, cfv, 10016)).toBe(0.5)
  })

  test('handles fractional story points from stringvalue', () => {
    const cfv = [makeCustomFieldValue({ issue: 1, customfield: 10016, stringvalue: '2.5' })]
    expect(lookupStoryPoints(1, cfv, 10016)).toBe(2.5)
  })

  test('returns null when stringvalue is empty string', () => {
    const cfv = [makeCustomFieldValue({ issue: 1, customfield: 10016, stringvalue: '' })]
    expect(lookupStoryPoints(1, cfv, 10016)).toBeNull()
  })

  test('handles Infinity numbervalue gracefully by returning null', () => {
    const cfv = [makeCustomFieldValue({ issue: 1, customfield: 10016, numbervalue: Infinity })]
    expect(lookupStoryPoints(1, cfv, 10016)).toBeNull()
  })
})

describe('isEpicIssueType', () => {
  test('returns true for Epic', () => expect(isEpicIssueType('Epic')).toBe(true))
  test('returns true for epic', () => expect(isEpicIssueType('epic')).toBe(true))
  test('returns true for EPIC', () => expect(isEpicIssueType('EPIC')).toBe(true))
  test('returns false for Story', () => expect(isEpicIssueType('Story')).toBe(false))
  test('returns false for Bug', () => expect(isEpicIssueType('Bug')).toBe(false))
  test('returns false for Sub-task', () => expect(isEpicIssueType('Sub-task')).toBe(false))
  test('returns false for Task', () => expect(isEpicIssueType('Task')).toBe(false))
})

describe('epic link from customfieldvalue stringvalue', () => {
  test('parses string issue id from stringvalue', () => {
    const cfv = [makeCustomFieldValue({ issue: 1001, customfield: 10014, stringvalue: '2500', numbervalue: null })]
    const result = lookupEpicLinkId(1001, cfv, 10014, makeStoryRow({ epic_link_id: null }))
    expect(result).toBe(2500)
  })

  test('returns null when stringvalue is non-numeric', () => {
    const cfv = [makeCustomFieldValue({ issue: 1001, customfield: 10014, stringvalue: 'PROJ-5', numbervalue: null })]
    const result = lookupEpicLinkId(1001, cfv, 10014, makeStoryRow({ epic_link_id: null }))
    expect(result).toBeNull()
  })
})
