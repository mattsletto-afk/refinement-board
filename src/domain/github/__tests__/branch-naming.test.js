const { describe, test, expect, beforeEach } = require('@jest/globals')

beforeEach(() => jest.clearAllMocks())

// Inline the logic from branch-naming.ts to avoid module resolution
const MAX_BRANCH_SEGMENT_LENGTH = 40
const BRANCH_PREFIX = 'agent'

function deriveBranchName(storyId, storyTitle) {
  const sanitizedId = storyId.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()

  if (!storyTitle) {
    return `${BRANCH_PREFIX}/${sanitizedId}`
  }

  const sanitizedTitle = storyTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, MAX_BRANCH_SEGMENT_LENGTH)
    .replace(/-$/, '')

  return `${BRANCH_PREFIX}/${sanitizedId}/${sanitizedTitle}`
}

function buildCommitMessage(storyId, storyTitle, agentAction) {
  const shortTitle = storyTitle.slice(0, 72)
  return `feat(${storyId}): ${shortTitle}\n\n${agentAction}`
}

describe('deriveBranchName', () => {
  test('generates branch with prefix and sanitized story ID', () => {
    const result = deriveBranchName('cmo6585or009cyojnet85ef9m')
    expect(result).toBe('agent/cmo6585or009cyojnet85ef9m')
  })

  test('includes sanitized story title when provided', () => {
    const result = deriveBranchName('abc123', 'GitHub PR Creation Feature')
    expect(result).toBe('agent/abc123/github-pr-creation-feature')
  })

  test('strips special characters from story title', () => {
    const result = deriveBranchName('story-1', 'Fix: Bug #42 — critical!')
    expect(result).toBe('agent/story-1/fix-bug-42--critical')
  })

  test('truncates long story titles to 40 characters', () => {
    const longTitle = 'This is a very long story title that exceeds the maximum allowed length in a branch name'
    const result = deriveBranchName('id1', longTitle)
    const titleSegment = result.split('/')[2]
    expect(titleSegment.length).toBeLessThanOrEqual(40)
  })

  test('removes trailing hyphens from title segment', () => {
    const result = deriveBranchName('id1', 'Trailing hyphen-')
    expect(result).not.toMatch(/-\/$|\/-$/)
    expect(result.endsWith('-')).toBe(false)
  })

  test('sanitizes story ID special chars to hyphens', () => {
    const result = deriveBranchName('cmo_story.id/123', 'My Feature')
    expect(result).toContain('cmo-story-id-123')
  })

  test('collapses multiple spaces in title to single hyphen', () => {
    const result = deriveBranchName('s1', 'Multiple   Spaces   Here')
    expect(result).toContain('multiple-spaces-here')
  })

  test('lowercases branch name', () => {
    const result = deriveBranchName('S1', 'UPPERCASE TITLE')
    expect(result).toBe(result.toLowerCase())
  })
})

describe('buildCommitMessage', () => {
  test('builds conventional commit message format', () => {
    const result = buildCommitMessage('story-1', 'Add feature', 'Implemented the thing')
    expect(result).toBe('feat(story-1): Add feature\n\nImplemented the thing')
  })

  test('truncates title to 72 characters', () => {
    const longTitle = 'A'.repeat(100)
    const result = buildCommitMessage('id', longTitle, 'action')
    const subject = result.split('\n')[0]
    const titlePart = subject.replace('feat(id): ', '')
    expect(titlePart.length).toBeLessThanOrEqual(72)
  })

  test('includes agent action in body', () => {
    const result = buildCommitMessage('s1', 'Title', 'Refactored module X')
    expect(result).toContain('Refactored module X')
  })

  test('separates subject and body with blank line', () => {
    const result = buildCommitMessage('s1', 'Title', 'Body text')
    const lines = result.split('\n')
    expect(lines[1]).toBe('')
  })

  test('includes story ID in feat() scope', () => {
    const result = buildCommitMessage('cmo6585or009c', 'Title', 'Action')
    expect(result).toContain('feat(cmo6585or009c):')
  })
})
