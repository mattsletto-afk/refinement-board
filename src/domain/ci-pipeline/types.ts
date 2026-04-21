export type CIJobStatus = 'success' | 'failure' | 'cancelled' | 'skipped'

export type CIOverallStatus = 'passed' | 'failed'

export interface CIPipelineResultPayload {
  prNumber: number
  prTitle: string
  sha: string
  branch: string
  repositoryFullName: string
  overallStatus: CIOverallStatus
  jobResults: {
    lint: CIJobStatus
    typecheck: CIJobStatus
    unitTests: CIJobStatus
    integrationTests: CIJobStatus
  }
  storyId?: string
}

export interface CIPipelineResultRecord {
  id: string
  prNumber: number
  prTitle: string
  sha: string
  branch: string
  repositoryFullName: string
  overallStatus: string
  lintStatus: string
  typecheckStatus: string
  unitTestStatus: string
  integrationTestStatus: string
  storyId: string | null
  receivedAt: Date
}
