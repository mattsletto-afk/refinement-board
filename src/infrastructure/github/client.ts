import { Octokit } from '@octokit/rest'

let _octokit: Octokit | null = null

export function getOctokit(): Octokit {
  if (_octokit) return _octokit

  const token = process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is required')
  }

  _octokit = new Octokit({ auth: token })
  return _octokit
}

export function getGitHubRepo(): { owner: string; repo: string } {
  const repoEnv = process.env.GITHUB_REPOSITORY
  if (!repoEnv) {
    throw new Error('GITHUB_REPOSITORY environment variable is required (format: owner/repo)')
  }

  const parts = repoEnv.split('/')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`GITHUB_REPOSITORY must be in format "owner/repo", got: ${repoEnv}`)
  }

  return { owner: parts[0], repo: parts[1] }
}
