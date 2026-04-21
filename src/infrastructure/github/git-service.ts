import { getOctokit, getGitHubRepo } from './client'
import type { CommitToBranchParams, GitHubFileChange, PullRequestResult, CreatePullRequestParams } from '@/src/domain/github/types'
import { deriveBranchName, buildCommitMessage } from '@/src/domain/github/branch-naming'
import { buildPrDescription } from '@/src/domain/github/pr-description'

async function getDefaultBranch(): Promise<string> {
  const octokit = getOctokit()
  const { owner, repo } = getGitHubRepo()

  const { data } = await octokit.repos.get({ owner, repo })
  return data.default_branch
}

async function getRefSha(ref: string): Promise<string> {
  const octokit = getOctokit()
  const { owner, repo } = getGitHubRepo()

  const { data } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${ref}`,
  })
  return data.object.sha
}

async function createBranch(branchName: string, fromSha: string): Promise<void> {
  const octokit = getOctokit()
  const { owner, repo } = getGitHubRepo()

  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: fromSha,
  })
}

async function branchExists(branchName: string): Promise<boolean> {
  const octokit = getOctokit()
  const { owner, repo } = getGitHubRepo()

  try {
    await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branchName}`,
    })
    return true
  } catch (error: unknown) {
    if (isNotFoundError(error)) return false
    throw error
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status: number }).status === 404
  )
}

async function createBlob(content: string, encoding: 'utf-8' | 'base64' = 'utf-8'): Promise<string> {
  const octokit = getOctokit()
  const { owner, repo } = getGitHubRepo()

  const { data } = await octokit.git.createBlob({
    owner,
    repo,
    content,
    encoding,
  })
  return data.sha
}

async function createTreeAndCommit(
  files: GitHubFileChange[],
  baseSha: string,
  message: string,
): Promise<string> {
  const octokit = getOctokit()
  const { owner, repo } = getGitHubRepo()

  const treeItems = await Promise.all(
    files.map(async (file) => {
      const blobSha = await createBlob(file.content, file.encoding ?? 'utf-8')
      return {
        path: file.path,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: blobSha,
      }
    }),
  )

  const { data: treeData } = await octokit.git.createTree({
    owner,
    repo,
    tree: treeItems,
    base_tree: baseSha,
  })

  const { data: commitData } = await octokit.git.createCommit({
    owner,
    repo,
    message,
    tree: treeData.sha,
    parents: [baseSha],
  })

  return commitData.sha
}

async function updateBranchRef(branchName: string, commitSha: string): Promise<void> {
  const octokit = getOctokit()
  const { owner, repo } = getGitHubRepo()

  await octokit.git.updateRef({
    owner,
    repo,
    ref: `heads/${branchName}`,
    sha: commitSha,
  })
}

export async function commitFilesToBranch(params: CommitToBranchParams): Promise<string> {
  const { branchName, files, commitMessage, baseRef } = params

  const defaultBranch = baseRef ?? (await getDefaultBranch())
  const baseSha = await getRefSha(defaultBranch)

  const exists = await branchExists(branchName)
  if (!exists) {
    await createBranch(branchName, baseSha)
  }

  const currentSha = exists ? await getRefSha(branchName) : baseSha
  const commitSha = await createTreeAndCommit(files, currentSha, commitMessage)
  await updateBranchRef(branchName, commitSha)

  return commitSha
}

export async function openPullRequest(params: CreatePullRequestParams): Promise<PullRequestResult> {
  const octokit = getOctokit()
  const { owner, repo } = getGitHubRepo()

  const {
    storyId,
    storyTitle,
    agentAction,
    diffSummary,
    filesChanged,
    baseRef,
  } = params

  const branchName = deriveBranchName(storyId, storyTitle)
  const defaultBranch = baseRef ?? (await getDefaultBranch())
  const boardBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL

  const description = buildPrDescription({
    storyId,
    storyTitle,
    agentAction,
    diffSummary,
    filesChanged,
    boardBaseUrl,
  })

  const title = `[Agent] ${storyTitle.slice(0, 100)}`

  const { data: pr } = await octokit.pulls.create({
    owner,
    repo,
    title,
    body: description,
    head: branchName,
    base: defaultBranch,
  })

  return {
    prNumber: pr.number,
    prUrl: pr.html_url,
    branchName,
    headSha: pr.head.sha,
  }
}

export async function createPullRequestFromDiff(params: CreatePullRequestParams & {
  files: GitHubFileChange[]
}): Promise<PullRequestResult> {
  const { storyId, storyTitle, agentAction, files, baseRef } = params

  const branchName = deriveBranchName(storyId, storyTitle)
  const commitMessage = buildCommitMessage(storyId, storyTitle, agentAction)

  await commitFilesToBranch({
    branchName,
    files,
    commitMessage,
    baseRef,
  })

  return openPullRequest(params)
}
