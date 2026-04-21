import type { CIPipelineResultPayload } from './types'

const VALID_JOB_STATUSES = new Set(['success', 'failure', 'cancelled', 'skipped'])
const VALID_OVERALL_STATUSES = new Set(['passed', 'failed'])

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export function validatePipelineResultPayload(
  raw: unknown
): ValidationResult {
  const errors: string[] = []

  if (typeof raw !== 'object' || raw === null) {
    return { valid: false, errors: ['Payload must be a non-null object'] }
  }

  const payload = raw as Record<string, unknown>

  if (typeof payload.prNumber !== 'number' || !Number.isInteger(payload.prNumber) || payload.prNumber < 1) {
    errors.push('prNumber must be a positive integer')
  }

  if (typeof payload.prTitle !== 'string' || payload.prTitle.trim().length === 0) {
    errors.push('prTitle must be a non-empty string')
  }

  if (typeof payload.sha !== 'string' || payload.sha.trim().length === 0) {
    errors.push('sha must be a non-empty string')
  }

  if (typeof payload.branch !== 'string' || payload.branch.trim().length === 0) {
    errors.push('branch must be a non-empty string')
  }

  if (typeof payload.repositoryFullName !== 'string' || payload.repositoryFullName.trim().length === 0) {
    errors.push('repositoryFullName must be a non-empty string')
  }

  if (typeof payload.overallStatus !== 'string' || !VALID_OVERALL_STATUSES.has(payload.overallStatus)) {
    errors.push('overallStatus must be one of: passed, failed')
  }

  if (typeof payload.jobResults !== 'object' || payload.jobResults === null) {
    errors.push('jobResults must be a non-null object')
  } else {
    const jobs = payload.jobResults as Record<string, unknown>
    const requiredJobs = ['lint', 'typecheck', 'unitTests', 'integrationTests'] as const
    for (const job of requiredJobs) {
      if (typeof jobs[job] !== 'string' || !VALID_JOB_STATUSES.has(jobs[job] as string)) {
        errors.push(`jobResults.${job} must be one of: success, failure, cancelled, skipped`)
      }
    }
  }

  if (payload.storyId !== undefined && payload.storyId !== null && typeof payload.storyId !== 'string') {
    errors.push('storyId must be a string if provided')
  }

  return { valid: errors.length === 0, errors }
}

export function parsePipelineResultPayload(raw: unknown): CIPipelineResultPayload {
  const payload = raw as Record<string, unknown>
  const jobs = payload.jobResults as Record<string, string>

  return {
    prNumber: payload.prNumber as number,
    prTitle: (payload.prTitle as string).trim(),
    sha: (payload.sha as string).trim(),
    branch: (payload.branch as string).trim(),
    repositoryFullName: (payload.repositoryFullName as string).trim(),
    overallStatus: payload.overallStatus as 'passed' | 'failed',
    jobResults: {
      lint: jobs.lint as 'success' | 'failure' | 'cancelled' | 'skipped',
      typecheck: jobs.typecheck as 'success' | 'failure' | 'cancelled' | 'skipped',
      unitTests: jobs.unitTests as 'success' | 'failure' | 'cancelled' | 'skipped',
      integrationTests: jobs.integrationTests as 'success' | 'failure' | 'cancelled' | 'skipped',
    },
    storyId: typeof payload.storyId === 'string' ? payload.storyId : undefined,
  }
}
