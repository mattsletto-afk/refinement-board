const { describe, test, expect, beforeEach } = require('@jest/globals')

beforeEach(() => jest.clearAllMocks())

// Inline request validation logic from the API route
function isValidBody(body) {
  if (typeof body !== 'object' || body === null) return false
  return (
    typeof body.storyId === 'string' && body.storyId.length > 0 &&
    typeof body.storyTitle === 'string' && body.storyTitle.length > 0 &&
    typeof body.agentAction === 'string' && body.agentAction.length > 0 &&
    typeof body.diffSummary === 'string' && body.diffSummary.length > 0
  )
}

describe('POST /api/github/pull-requests validation', () => {
  test('accepts valid body with all required fields', () => {
    expect(isValidBody({
      storyId: 'cmo6585or009cyojnet85ef9m',
      storyTitle: 'GitHub PR Creation',
      agentAction: 'Added service layer',
      diffSummary: 'Created 3 files',
    })).toBe(true)
  })

  test('rejects null body', () => {
    expect(isValidBody(null)).toBe(false)
  })

  test('rejects non-object body', () => {
    expect(isValidBody('string')).toBe(false)
    expect(isValidBody(42)).toBe(false)
  })

  test('rejects body missing storyId', () => {
    expect(isValidBody({
      storyTitle: 'Title',
      agentAction: 'action',
      diffSummary: 'summary',
    })).toBe(false)
  })

  test('rejects body missing storyTitle', () => {
    expect(isValidBody({
      storyId: 'id1',
      agentAction: 'action',
      diffSummary: 'summary',
    })).toBe(false)
  })

  test('rejects body missing agentAction', () => {
    expect(isValidBody({
      storyId: 'id1',
      storyTitle: 'Title',
      diffSummary: 'summary',
    })).toBe(false)
  })

  test('rejects body missing diffSummary', () => {
    expect(isValidBody({
      storyId: 'id1',
      storyTitle: 'Title',
      agentAction: 'action',
    })).toBe(false)
  })

  test('rejects body with empty string storyId', () => {
    expect(isValidBody({
      storyId: '',
      storyTitle: 'Title',
      agentAction: 'action',
      diffSummary: 'summary',
    })).toBe(false)
  })

  test('rejects body with non-string storyId', () => {
    expect(isValidBody({
      storyId: 123,
      storyTitle: 'Title',
      agentAction: 'action',
      diffSummary: 'summary',
    })).toBe(false)
  })

  test('accepts body with optional files array', () => {
    expect(isValidBody({
      storyId: 'id1',
      storyTitle: 'Title',
      agentAction: 'action',
      diffSummary: 'summary',
      files: [{ path: 'src/foo.ts', content: 'export {}' }],
    })).toBe(true)
  })
})
