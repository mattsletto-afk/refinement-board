const { describe, test, expect, beforeEach } = require('@jest/globals')

beforeEach(() => jest.clearAllMocks())

// Inline the logic under test — no source imports allowed in sandbox

function normalizeStatus(jiraStatus) {
  const s = jiraStatus.toLowerCase().trim()
  if (s === 'done' || s === 'closed' || s === 'resolved') return 'done'
  if (s === 'in progress' || s === 'in-progress' || s === 'active') return 'active'
  return 'backlog'
}

function normalizePriority(jiraPriority) {
  const p = jiraPriority.toLowerCase().trim()
  if (p === 'critical' || p === 'blocker') return 'critical'
  if (p === 'high' || p === 'major') return 'high'
  if (p === 'low' || p === 'minor' || p === 'trivial') return 'low'
  return 'medium'
}

function isPkeyFormat(value) {
  return /^[A-Z][A-Z0-9]*-\d+$/.test(value)
}

function mergeStoryFields(incoming, existing) {
  const merged = {}
  const incomingTitle = incoming.title.trim()
  if (incomingTitle.length > 0 && incomingTitle !== existing.title) {
    merged.title = incomingTitle
  }
  const statusChanged = normalizeStatus(incoming.status) !== existing.status
  if (statusChanged) {
    merged.status = incoming.status
  }
  if (incoming.epicId !== null && incoming.epicId !== existing.epicId) {
    merged.epicId = incoming.epicId
  }
  if (incoming.featureId !== null && incoming.featureId !== existing.featureId) {
    merged.featureId = incoming.featureId
  }
  return merged
}

function mergeEpicFields(incoming, existing) {
  const merged = {}
  const incomingTitle = incoming.title.trim()
  if (incomingTitle.length > 0 && incomingTitle !== existing.title) {
    merged.title = incomingTitle
  }
  const statusChanged = normalizeStatus(incoming.status) !== existing.status
  if (statusChanged) {
    merged.status = incoming.status
  }
  const priorityChanged = normalizePriority(incoming.priority) !== existing.priority
  if (priorityChanged) {
    merged.priority = incoming.priority
  }
  return merged
}

function resolveStoryConflict(incoming, existing, strategy) {
  if (existing === null) {
    return { action: 'insert', data: incoming }
  }
  if (strategy === 'skip') {
    return { action: 'skip', data: {} }
  }
  if (strategy === 'overwrite') {
    return { action: 'update', data: incoming }
  }
  return { action: 'update', data: mergeStoryFields(incoming, existing) }
}

function resolveEpicConflict(incoming, existing, strategy) {
  if (existing === null) {
    return { action: 'insert', data: incoming }
  }
  if (strategy === 'skip') {
    return { action: 'skip', data: {} }
  }
  if (strategy === 'overwrite') {
    return { action: 'update', data: incoming }
  }
  return { action: 'update', data: mergeEpicFields(incoming, existing) }
}

function extractPkey(title, fallbackPkey) {
  const match = title.match(/^([A-Z][A-Z0-9]*-\d+)/)
  return match ? match[1] : fallbackPkey
}

// --- Tests ---

describe('normalizeStatus', () => {
  test('maps done variants to done', () => {
    expect(normalizeStatus('Done')).toBe('done')
    expect(normalizeStatus('closed')).toBe('done')
    expect(normalizeStatus('RESOLVED')).toBe('done')
  })

  test('maps in progress variants to active', () => {
    expect(normalizeStatus('In Progress')).toBe('active')
    expect(normalizeStatus('in-progress')).toBe('active')
    expect(normalizeStatus('active')).toBe('active')
  })

  test('maps unknown statuses to backlog', () => {
    expect(normalizeStatus('Open')).toBe('backlog')
    expect(normalizeStatus('To Do')).toBe('backlog')
    expect(normalizeStatus('Backlog')).toBe('backlog')
    expect(normalizeStatus('')).toBe('backlog')
  })
})

describe('normalizePriority', () => {
  test('maps blocker/critical to critical', () => {
    expect(normalizePriority('Blocker')).toBe('critical')
    expect(normalizePriority('Critical')).toBe('critical')
  })

  test('maps high/major to high', () => {
    expect(normalizePriority('High')).toBe('high')
    expect(normalizePriority('Major')).toBe('high')
  })

  test('maps low/minor/trivial to low', () => {
    expect(normalizePriority('Low')).toBe('low')
    expect(normalizePriority('Minor')).toBe('low')
    expect(normalizePriority('Trivial')).toBe('low')
  })

  test('maps medium and unknown to medium', () => {
    expect(normalizePriority('Medium')).toBe('medium')
    expect(normalizePriority('Normal')).toBe('medium')
    expect(normalizePriority('')).toBe('medium')
  })
})

describe('isPkeyFormat', () => {
  test('accepts valid Jira pkeys', () => {
    expect(isPkeyFormat('PROJ-123')).toBe(true)
    expect(isPkeyFormat('AB-1')).toBe(true)
    expect(isPkeyFormat('ABC123-999')).toBe(true)
  })

  test('rejects invalid formats', () => {
    expect(isPkeyFormat('proj-123')).toBe(false)
    expect(isPkeyFormat('PROJ123')).toBe(false)
    expect(isPkeyFormat('123-PROJ')).toBe(false)
    expect(isPkeyFormat('')).toBe(false)
    expect(isPkeyFormat('PROJ-')).toBe(false)
  })
})

describe('extractPkey', () => {
  test('extracts pkey from title with description', () => {
    expect(extractPkey('PROJ-123 Fix the login bug', 'fallback')).toBe('PROJ-123')
  })

  test('returns fallback when no pkey in title', () => {
    expect(extractPkey('Fix the login bug', 'fallback')).toBe('fallback')
  })

  test('handles pkey-only title', () => {
    expect(extractPkey('PROJ-999', 'fallback')).toBe('PROJ-999')
  })
})

describe('resolveStoryConflict', () => {
  const incoming = {
    pkey: 'PROJ-1',
    title: 'PROJ-1 New Title',
    status: 'Done',
    priority: 'High',
    epicId: 'epic-abc',
    featureId: null,
    storyPoints: 3,
    description: null,
    assignee: null,
    labels: [],
  }

  test('inserts when no existing record', () => {
    const result = resolveStoryConflict(incoming, null, 'skip')
    expect(result.action).toBe('insert')
    expect(result.data).toEqual(incoming)
  })

  test('skip strategy returns skip action when record exists', () => {
    const existing = { id: 'story-1', title: 'PROJ-1 Old Title', status: 'backlog', epicId: null }
    const result = resolveStoryConflict(incoming, existing, 'skip')
    expect(result.action).toBe('skip')
    expect(result.data).toEqual({})
  })

  test('overwrite strategy returns update with full incoming data', () => {
    const existing = { id: 'story-1', title: 'PROJ-1 Old Title', status: 'backlog', epicId: null }
    const result = resolveStoryConflict(incoming, existing, 'overwrite')
    expect(result.action).toBe('update')
    expect(result.data).toEqual(incoming)
  })

  test('merge strategy returns update with only changed fields', () => {
    const existing = { id: 'story-1', title: 'PROJ-1 New Title', status: 'done', epicId: null, featureId: null }
    const result = resolveStoryConflict(incoming, existing, 'merge')
    expect(result.action).toBe('update')
    expect(result.data.title).toBeUndefined()
    expect(result.data.epicId).toBe('epic-abc')
  })

  test('merge strategy includes title when changed', () => {
    const existing = { id: 'story-1', title: 'PROJ-1 Old Title', status: 'done', epicId: null, featureId: null }
    const result = resolveStoryConflict(incoming, existing, 'merge')
    expect(result.action).toBe('update')
    expect(result.data.title).toBe('PROJ-1 New Title')
  })
})

describe('resolveEpicConflict', () => {
  const incoming = {
    pkey: 'PROJ-E1',
    title: 'PROJ-E1 New Epic Title',
    status: 'In Progress',
    priority: 'Critical',
    description: null,
    labels: [],
  }

  test('inserts when no existing record', () => {
    const result = resolveEpicConflict(incoming, null, 'overwrite')
    expect(result.action).toBe('insert')
    expect(result.data).toEqual(incoming)
  })

  test('skip strategy skips existing epic', () => {
    const existing = { id: 'epic-1', title: 'PROJ-E1 Old Title', status: 'backlog', priority: 'medium' }
    const result = resolveEpicConflict(incoming, existing, 'skip')
    expect(result.action).toBe('skip')
  })

  test('overwrite strategy replaces all fields', () => {
    const existing = { id: 'epic-1', title: 'PROJ-E1 Old Title', status: 'backlog', priority: 'medium' }
    const result = resolveEpicConflict(incoming, existing, 'overwrite')
    expect(result.action).toBe('update')
    expect(result.data).toEqual(incoming)
  })

  test('merge strategy picks up changed title', () => {
    const existing = { id: 'epic-1', title: 'PROJ-E1 Old Title', status: 'active', priority: 'critical' }
    const result = resolveEpicConflict(incoming, existing, 'merge')
    expect(result.action).toBe('update')
    expect(result.data.title).toBe('PROJ-E1 New Epic Title')
  })

  test('merge strategy does not change priority when same', () => {
    const existing = { id: 'epic-1', title: 'PROJ-E1 Same', status: 'active', priority: 'critical' }
    const incomingCritical = { ...incoming, title: 'PROJ-E1 Same', status: 'active' }
    const result = resolveEpicConflict(incomingCritical, existing, 'merge')
    expect(result.data.priority).toBeUndefined()
  })
})

describe('mergeStoryFields edge cases', () => {
  test('empty incoming title does not overwrite existing', () => {
    const incoming = {
      pkey: 'PROJ-1', title: '   ', status: 'backlog',
      priority: 'medium', epicId: null, featureId: null,
      storyPoints: null, description: null, assignee: null, labels: []
    }
    const existing = { id: 'x', title: 'Existing Title', status: 'backlog', epicId: null, featureId: null }
    const result = resolveStoryConflict(incoming, existing, 'merge')
    expect(result.data.title).toBeUndefined()
  })

  test('null epicId in incoming does not overwrite existing epicId in merge', () => {
    const incoming = {
      pkey: 'PROJ-1', title: 'PROJ-1 Same', status: 'backlog',
      priority: 'medium', epicId: null, featureId: null,
      storyPoints: null, description: null, assignee: null, labels: []
    }
    const existing = { id: 'x', title: 'PROJ-1 Same', status: 'backlog', epicId: 'epic-keep', featureId: null }
    const result = resolveStoryConflict(incoming, existing, 'merge')
    expect(result.data.epicId).toBeUndefined()
  })
})
