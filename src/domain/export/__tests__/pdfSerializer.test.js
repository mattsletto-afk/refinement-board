const { describe, test, expect, beforeEach } = require('@jest/globals')

// Inline the HTML serializer logic
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatDate(date) {
  return date.toISOString().split('T')[0]
}

function statusPill(status) {
  const colorMap = {
    done: '#22c55e',
    active: '#3b82f6',
    backlog: '#94a3b8',
    open: '#f59e0b',
    closed: '#6b7280',
    critical: '#ef4444',
    high: '#f97316',
    medium: '#eab308',
    low: '#22c55e',
    upcoming: '#8b5cf6',
    completed: '#22c55e',
  }
  const color = colorMap[status.toLowerCase()] ?? '#94a3b8'
  return `<span style="background:${color};color:#fff;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:600">${escapeHtml(status)}</span>`
}

function serializeToHtml(data) {
  const sections = []

  if (data.milestones.length > 0) {
    const items = data.milestones
      .map(m => `<li><strong>${escapeHtml(m.title)}</strong> ${statusPill(m.status)}</li>`)
      .join('\n')
    sections.push(`<h2>Milestones</h2><ul>${items}</ul>`)
  }

  if (data.epics.length > 0) {
    sections.push('<h2>Epics &amp; Features</h2>')
    for (const epic of data.epics) {
      sections.push(
        `<h3>${escapeHtml(epic.title)}</h3>` +
        `<p>${statusPill(epic.status)} ${statusPill(epic.priority)}</p>`
      )
      for (const feature of epic.features) {
        sections.push(`<h4>${escapeHtml(feature.title)}</h4>`)
        for (const story of feature.stories) {
          sections.push(
            `<h5>${escapeHtml(story.title)}</h5>` +
            `<p>Status: ${statusPill(story.status)}</p>`
          )
          if (story.tasks.length > 0) {
            const taskItems = story.tasks
              .map(t => `<li>${escapeHtml(t.title)}</li>`)
              .join('\n')
            sections.push(`<ul>${taskItems}</ul>`)
          }
        }
      }
      for (const story of epic.stories) {
        sections.push(
          `<h4>${escapeHtml(story.title)}</h4>` +
          `<p>Status: ${statusPill(story.status)}</p>`
        )
        if (story.tasks.length > 0) {
          const taskItems = story.tasks
            .map(t => `<li>${escapeHtml(t.title)}</li>`)
            .join('\n')
          sections.push(`<ul>${taskItems}</ul>`)
        }
      }
    }
  }

  if (data.orphanStories.length > 0) {
    sections.push('<h2>Stories (No Epic)</h2>')
    for (const story of data.orphanStories) {
      sections.push(
        `<h3>${escapeHtml(story.title)}</h3>` +
        `<p>Status: ${statusPill(story.status)}</p>`
      )
      if (story.tasks.length > 0) {
        const taskItems = story.tasks
          .map(t => `<li>${escapeHtml(t.title)}</li>`)
          .join('\n')
        sections.push(`<ul>${taskItems}</ul>`)
      }
    }
  }

  if (data.risks.length > 0) {
    const items = data.risks
      .map(r => `<li><strong>${escapeHtml(r.title)}</strong> ${statusPill(r.status)}</li>`)
      .join('\n')
    sections.push(`<h2>Risks</h2><ul>${items}</ul>`)
  }

  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<title>${escapeHtml(data.projectName)}</title>\n</head>\n<body>\n<h1>${escapeHtml(data.projectName)}</h1>\n<p class="subtitle">Exported on ${formatDate(data.exportedAt)}</p>\n<hr />\n${sections.join('\n')}\n</body>\n</html>`
}

function makeData(overrides = {}) {
  return {
    projectName: 'Test Project',
    exportedAt: new Date('2024-03-01T00:00:00Z'),
    epics: [],
    orphanStories: [],
    risks: [],
    milestones: [],
    ...overrides,
  }
}

function makeStory(overrides = {}) {
  return { id: 's1', title: 'Story', status: 'backlog', tasks: [], ...overrides }
}

describe('escapeHtml', () => {
  beforeEach(() => {})

  test('escapes ampersand', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B')
  })

  test('escapes less-than', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
  })

  test('escapes double quotes', () => {
    expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;')
  })

  test('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#039;s')
  })

  test('leaves normal text unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World')
  })
})

describe('statusPill', () => {
  test('renders done status with green color', () => {
    const result = statusPill('done')
    expect(result).toContain('#22c55e')
    expect(result).toContain('done')
  })

  test('renders critical status with red color', () => {
    const result = statusPill('critical')
    expect(result).toContain('#ef4444')
  })

  test('unknown status gets default grey color', () => {
    const result = statusPill('unknown-status')
    expect(result).toContain('#94a3b8')
  })

  test('is case-insensitive', () => {
    const result = statusPill('DONE')
    expect(result).toContain('#22c55e')
  })
})

describe('serializeToHtml', () => {
  test('produces valid HTML document structure', () => {
    const result = serializeToHtml(makeData())
    expect(result).toContain('<!DOCTYPE html>')
    expect(result).toContain('<html lang="en">')
    expect(result).toContain('</html>')
    expect(result).toContain('<body>')
    expect(result).toContain('</body>')
  })

  test('includes project name in title and h1', () => {
    const result = serializeToHtml(makeData({ projectName: 'My Board' }))
    expect(result).toContain('<title>My Board</title>')
    expect(result).toContain('<h1>My Board</h1>')
  })

  test('includes formatted export date', () => {
    const result = serializeToHtml(makeData())
    expect(result).toContain('Exported on 2024-03-01')
  })

  test('renders milestones section when present', () => {
    const data = makeData({
      milestones: [{ id: 'm1', title: 'Go Live', status: 'upcoming' }],
    })
    const result = serializeToHtml(data)
    expect(result).toContain('<h2>Milestones</h2>')
    expect(result).toContain('Go Live')
    expect(result).toContain('upcoming')
  })

  test('omits milestones section when empty', () => {
    const result = serializeToHtml(makeData())
    expect(result).not.toContain('<h2>Milestones</h2>')
  })

  test('renders risks section', () => {
    const data = makeData({
      risks: [{ id: 'r1', title: 'Security Risk', status: 'open' }],
    })
    const result = serializeToHtml(data)
    expect(result).toContain('<h2>Risks</h2>')
    expect(result).toContain('Security Risk')
  })

  test('renders orphan stories', () => {
    const data = makeData({
      orphanStories: [makeStory({ title: 'Orphan', status: 'done' })],
    })
    const result = serializeToHtml(data)
    expect(result).toContain('<h2>Stories (No Epic)</h2>')
    expect(result).toContain('Orphan')
  })

  test('renders tasks under orphan story', () => {
    const story = makeStory({
      tasks: [{ id: 't1', title: 'Task One', storyId: 's1' }],
    })
    const result = serializeToHtml(makeData({ orphanStories: [story] }))
    expect(result).toContain('<li>Task One</li>')
  })

  test('escapes project name with special characters', () => {
    const data = makeData({ projectName: '<My & Board>' })
    const result = serializeToHtml(data)
    expect(result).toContain('&lt;My &amp; Board&gt;')
    expect(result).not.toContain('<My & Board>')
  })

  test('renders epic with features and stories', () => {
    const story = makeStory({ title: 'Feature Story', featureId: 'f1' })
    const feature = { id: 'f1', title: 'Core Feature', epicId: 'e1', stories: [story] }
    const epic = {
      id: 'e1', title: 'Big Epic', status: 'backlog', priority: 'high',
      features: [feature], stories: [],
    }
    const result = serializeToHtml(makeData({ epics: [epic] }))
    expect(result).toContain('<h2>Epics &amp; Features</h2>')
    expect(result).toContain('<h3>Big Epic</h3>')
    expect(result).toContain('<h4>Core Feature</h4>')
    expect(result).toContain('<h5>Feature Story</h5>')
  })
})
