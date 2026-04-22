const { describe, test, expect, beforeEach } = require('@jest/globals')

// Inline the serializer logic for self-contained testing
function formatDate(date) {
  return date.toISOString().split('T')[0]
}

function statusBadge(status) {
  return `\`${status}\``
}

function serializeTask(task, indent = '  ') {
  return `${indent}- [ ] ${task.title}`
}

function serializeStory(story, level = 3) {
  const heading = '#'.repeat(level)
  const lines = [
    `${heading} ${story.title}`,
    '',
    `**Status:** ${statusBadge(story.status)}`,
    '',
  ]
  if (story.tasks.length > 0) {
    lines.push('**Tasks:**', '')
    for (const task of story.tasks) {
      lines.push(serializeTask(task))
    }
    lines.push('')
  }
  return lines.join('\n')
}

function serializeFeature(feature, level = 2) {
  const heading = '#'.repeat(level)
  const lines = [`${heading} ${feature.title}`, '']
  for (const story of feature.stories) {
    lines.push(serializeStory(story, level + 1))
  }
  return lines.join('\n')
}

function serializeEpic(epic, level = 1) {
  const heading = '#'.repeat(level + 1)
  const lines = [
    `${heading} Epic: ${epic.title}`,
    '',
    `**Status:** ${statusBadge(epic.status)}  **Priority:** ${statusBadge(epic.priority)}`,
    '',
  ]
  for (const feature of epic.features) {
    lines.push(serializeFeature(feature, level + 2))
  }
  for (const story of epic.stories) {
    lines.push(serializeStory(story, level + 2))
  }
  return lines.join('\n')
}

function serializeToMarkdown(data) {
  const lines = [
    `# ${data.projectName}`,
    '',
    `> Exported on ${formatDate(data.exportedAt)}`,
    '',
    '---',
    '',
  ]

  if (data.milestones.length > 0) {
    lines.push('## Milestones', '')
    for (const milestone of data.milestones) {
      lines.push(`- **${milestone.title}** — ${statusBadge(milestone.status)}`)
    }
    lines.push('')
  }

  if (data.epics.length > 0) {
    lines.push('## Epics & Features', '')
    for (const epic of data.epics) {
      lines.push(serializeEpic(epic))
    }
  }

  if (data.orphanStories.length > 0) {
    lines.push('## Stories (No Epic)', '')
    for (const story of data.orphanStories) {
      lines.push(serializeStory(story, 3))
    }
  }

  if (data.risks.length > 0) {
    lines.push('## Risks', '')
    for (const risk of data.risks) {
      lines.push(`- **${risk.title}** — ${statusBadge(risk.status)}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function makeStory(overrides = {}) {
  return {
    id: 's1',
    title: 'Test Story',
    status: 'backlog',
    tasks: [],
    epicId: null,
    featureId: null,
    ...overrides,
  }
}

function makeData(overrides = {}) {
  return {
    projectName: 'Test Project',
    exportedAt: new Date('2024-01-15T00:00:00Z'),
    epics: [],
    orphanStories: [],
    risks: [],
    milestones: [],
    ...overrides,
  }
}

describe('serializeToMarkdown', () => {
  beforeEach(() => {})

  test('includes project name as H1', () => {
    const result = serializeToMarkdown(makeData({ projectName: 'My Board' }))
    expect(result).toContain('# My Board')
  })

  test('includes export date in blockquote', () => {
    const result = serializeToMarkdown(makeData())
    expect(result).toContain('> Exported on 2024-01-15')
  })

  test('renders milestones section when milestones present', () => {
    const data = makeData({
      milestones: [{ id: 'm1', title: 'Sprint Gate', status: 'upcoming' }],
    })
    const result = serializeToMarkdown(data)
    expect(result).toContain('## Milestones')
    expect(result).toContain('**Sprint Gate**')
    expect(result).toContain('`upcoming`')
  })

  test('omits milestones section when empty', () => {
    const result = serializeToMarkdown(makeData({ milestones: [] }))
    expect(result).not.toContain('## Milestones')
  })

  test('renders orphan stories section', () => {
    const data = makeData({
      orphanStories: [makeStory({ title: 'Orphan Story', status: 'done' })],
    })
    const result = serializeToMarkdown(data)
    expect(result).toContain('## Stories (No Epic)')
    expect(result).toContain('### Orphan Story')
    expect(result).toContain('`done`')
  })

  test('renders tasks under a story', () => {
    const story = makeStory({
      tasks: [
        { id: 't1', title: 'Write tests', storyId: 's1' },
        { id: 't2', title: 'Deploy feature', storyId: 's1' },
      ],
    })
    const data = makeData({ orphanStories: [story] })
    const result = serializeToMarkdown(data)
    expect(result).toContain('**Tasks:**')
    expect(result).toContain('- [ ] Write tests')
    expect(result).toContain('- [ ] Deploy feature')
  })

  test('renders risks section', () => {
    const data = makeData({
      risks: [{ id: 'r1', title: 'Data loss risk', status: 'open' }],
    })
    const result = serializeToMarkdown(data)
    expect(result).toContain('## Risks')
    expect(result).toContain('**Data loss risk**')
    expect(result).toContain('`open`')
  })

  test('renders epics section with nested features and stories', () => {
    const story = makeStory({ title: 'Feature Story', status: 'active', featureId: 'f1' })
    const feature = { id: 'f1', title: 'My Feature', epicId: 'e1', stories: [story] }
    const epic = {
      id: 'e1',
      title: 'Big Epic',
      status: 'backlog',
      priority: 'high',
      features: [feature],
      stories: [],
    }
    const data = makeData({ epics: [epic] })
    const result = serializeToMarkdown(data)
    expect(result).toContain('## Epics & Features')
    expect(result).toContain('Epic: Big Epic')
    expect(result).toContain('My Feature')
    expect(result).toContain('Feature Story')
    expect(result).toContain('`high`')
  })

  test('renders stories directly attached to epic (no feature)', () => {
    const story = makeStory({ title: 'Epic Direct Story', epicId: 'e1' })
    const epic = {
      id: 'e1',
      title: 'Solo Epic',
      status: 'active',
      priority: 'critical',
      features: [],
      stories: [story],
    }
    const result = serializeToMarkdown(makeData({ epics: [epic] }))
    expect(result).toContain('Epic Direct Story')
  })

  test('empty project renders minimal document with separator', () => {
    const result = serializeToMarkdown(makeData())
    expect(result).toContain('---')
    expect(result).not.toContain('## Epics')
    expect(result).not.toContain('## Risks')
    expect(result).not.toContain('## Stories')
  })

  test('statusBadge wraps value in backticks', () => {
    expect(statusBadge('done')).toBe('`done`')
    expect(statusBadge('critical')).toBe('`critical`')
  })

  test('serializeTask produces checkbox syntax', () => {
    const task = { id: 't1', title: 'Do work', storyId: 's1' }
    expect(serializeTask(task)).toBe('  - [ ] Do work')
  })
})

describe('serializeEpic heading levels', () => {
  test('epic title uses H2 at default level 1', () => {
    const epic = { id: 'e1', title: 'Test Epic', status: 'backlog', priority: 'medium', features: [], stories: [] }
    const result = serializeEpic(epic, 1)
    expect(result.startsWith('## Epic: Test Epic')).toBe(true)
  })

  test('feature under epic uses H3', () => {
    const story = makeStory()
    const feature = { id: 'f1', title: 'Test Feature', epicId: 'e1', stories: [story] }
    const result = serializeFeature(feature, 3)
    expect(result.startsWith('### Test Feature')).toBe(true)
  })
})
