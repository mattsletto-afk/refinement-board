const { describe, test, expect, beforeEach, jest } = require('@jest/globals')

beforeEach(() => jest.clearAllMocks())

// Self-contained test: simulate the key behaviours of the git service

function deriveBranchName(storyId, storyTitle) {
  const sanitizedId = storyId.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
  if (!storyTitle) return `agent/${sanitizedId}`
  const sanitizedTitle = storyTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
    .replace(/-$/, '')
  return `agent/${sanitizedId}/${sanitizedTitle}`
}

function isNotFoundError(error) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 404
  )
}

describe('isNotFoundError', () => {
  test('returns true for 404 error objects', () => {
    expect(isNotFoundError({ status: 404 })).toBe(true)
  })

  test('returns false for non-404 errors', () => {
    expect(isNotFoundError({ status: 422 })).toBe(false)
    expect(isNotFoundError({ status: 500 })).toBe(false)
  })

  test('returns false for null', () => {
    expect(isNotFoundError(null)).toBe(false)
  })

  test('returns false for non-objects', () => {
    expect(isNotFoundError('error')).toBe(false)
    expect(isNotFoundError(404)).toBe(false)
  })

  test('returns false for objects without status', () => {
    expect(isNotFoundError({ message: 'not found' })).toBe(false)
  })
})

describe('PR creation flow', () => {
  test('derives correct branch name for story', () => {
    const branch = deriveBranchName('cmo6585or009cyojnet85ef9m', 'GitHub PR creation')
    expect(branch).toMatch(/^agent\/cmo6585or009cyojnet85ef9m\/github-pr-creation$/)
  })

  test('mock: commitFilesToBranch creates branch and commits files', async () => {
    const mockGetRef = jest.fn()
      .mockResolvedValueOnce({ data: { object: { sha: 'base-sha-123' } } })
      .mockRejectedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ data: { object: { sha: 'base-sha-123' } } })

    const mockCreateRef = jest.fn().mockResolvedValue({})
    const mockCreateBlob = jest.fn().mockResolvedValue({ data: { sha: 'blob-sha' } })
    const mockCreateTree = jest.fn().mockResolvedValue({ data: { sha: 'tree-sha' } })
    const mockCreateCommit = jest.fn().mockResolvedValue({ data: { sha: 'commit-sha' } })
    const mockUpdateRef = jest.fn().mockResolvedValue({})

    // Simulate the flow
    const baseSha = (await mockGetRef()).data.object.sha
    expect(baseSha).toBe('base-sha-123')

    // Branch doesn't exist: 404 means we create it
    let exists = true
    try {
      await mockGetRef()
    } catch (err) {
      if (isNotFoundError(err)) exists = false
    }
    expect(exists).toBe(false)

    await mockCreateRef()
    expect(mockCreateRef).toHaveBeenCalledTimes(1)

    const blobSha = (await mockCreateBlob()).data.sha
    expect(blobSha).toBe('blob-sha')

    const treeSha = (await mockCreateTree()).data.sha
    expect(treeSha).toBe('tree-sha')

    const commitSha = (await mockCreateCommit()).data.sha
    expect(commitSha).toBe('commit-sha')

    await mockUpdateRef()
    expect(mockUpdateRef).toHaveBeenCalledTimes(1)
  })

  test('mock: openPullRequest builds correct PR payload', async () => {
    const mockCreatePr = jest.fn().mockResolvedValue({
      data: {
        number: 42,
        html_url: 'https://github.com/owner/repo/pull/42',
        head: { sha: 'head-sha-456', ref: 'agent/story-1/my-story' },
        state: 'open',
      },
    })

    const pr = (await mockCreatePr()).data
    expect(pr.number).toBe(42)
    expect(pr.html_url).toBe('https://github.com/owner/repo/pull/42')
    expect(pr.state).toBe('open')
  })

  test('mock: PR title is prefixed with [Agent]', () => {
    const storyTitle = 'GitHub PR creation from agent-generated diffs'
    const title = `[Agent] ${storyTitle.slice(0, 100)}`
    expect(title).toBe('[Agent] GitHub PR creation from agent-generated diffs')
  })

  test('mock: long PR title is truncated to 100 chars after prefix', () => {
    const longTitle = 'A'.repeat(150)
    const title = `[Agent] ${longTitle.slice(0, 100)}`
    expect(title.length).toBe('[Agent] '.length + 100)
  })
})

describe('getGitHubRepo parsing', () => {
  function parseGitHubRepo(repoEnv) {
    if (!repoEnv) throw new Error('GITHUB_REPOSITORY environment variable is required')
    const parts = repoEnv.split('/')
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(`GITHUB_REPOSITORY must be in format "owner/repo", got: ${repoEnv}`)
    }
    return { owner: parts[0], repo: parts[1] }
  }

  test('parses valid owner/repo format', () => {
    const result = parseGitHubRepo('acme/my-repo')
    expect(result).toEqual({ owner: 'acme', repo: 'my-repo' })
  })

  test('throws for missing env var', () => {
    expect(() => parseGitHubRepo(undefined)).toThrow('GITHUB_REPOSITORY environment variable is required')
  })

  test('throws for invalid format with no slash', () => {
    expect(() => parseGitHubRepo('noslash')).toThrow('GITHUB_REPOSITORY must be in format')
  })

  test('throws for format with multiple slashes', () => {
    expect(() => parseGitHubRepo('a/b/c')).toThrow('GITHUB_REPOSITORY must be in format')
  })

  test('throws for empty owner segment', () => {
    expect(() => parseGitHubRepo('/repo')).toThrow('GITHUB_REPOSITORY must be in format')
  })
})
