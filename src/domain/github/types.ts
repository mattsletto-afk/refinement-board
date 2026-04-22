export interface CreatePullRequestParams {
  storyId: string
  storyTitle: string
  agentAction: string
  diffSummary: string
  filesChanged: string[]
  baseRef?: string
}

export interface PullRequestResult {
  prNumber: number
  prUrl: string
  branchName: string
  headSha: string
}

export interface GitHubFileChange {
  path: string
  content: string
  encoding?: 'utf-8' | 'base64'
}

export interface CommitToBranchParams {
  branchName: string
  files: GitHubFileChange[]
  commitMessage: string
  baseRef?: string
}
