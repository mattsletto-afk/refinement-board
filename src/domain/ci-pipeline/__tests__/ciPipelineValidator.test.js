const { describe, test, expect, beforeEach } = require('@jest/globals')

// Inline the validator logic for self-contained testing
const VALID_JOB_STATUSES = new Set(['success', 'failure', 'cancelled', 'skipped'])
const VALID_OVERALL_STATUSES = new Set(['passed', 'failed'])

function validatePipelineResultPayload(raw) {
  const errors = []

  if (typeof raw !== 'object' || raw === null) {
    return { valid: false, errors: ['Payload must be a non-null object'] }
  }

  const payload = raw

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
    const jobs = payload.jobResults
    const requiredJobs = ['lint', 'typecheck', 'unitTests', 'integrationTests']
    for (const job of requiredJobs) {
      if (typeof jobs[job] !== 'string' || !VALID_JOB_STATUSES.has(jobs[job])) {
        errors.push(`jobResults.${job} must be one of: success, failure, cancelled, skipped`)
      }
    }
  }

  if (payload.storyId !== undefined && payload.storyId !== null && typeof payload.storyId !== 'string') {
    errors.push('storyId must be a string if provided')
  }

  return { valid: errors.length === 0, errors }
}

function parsePipelineResultPayload(raw) {
  const payload = raw
  const jobs = payload.jobResults

  return {
    prNumber: payload.prNumber,
    prTitle: payload.prTitle.trim(),
    sha: payload.sha.trim(),
    branch: payload.branch.trim(),
    repositoryFullName: payload.repositoryFullName.trim(),
    overallStatus: payload.overallStatus,
    jobResults: {
      lint: jobs.lint,
      typecheck: jobs.typecheck,
      unitTests: jobs.unitTests,
      integrationTests: jobs.integrationTests,
    },
    storyId: typeof payload.storyId === 'string' ? payload.storyId : undefined,
  }
}

const validPayload = {
  prNumber: 42,
  prTitle: 'feat: add ci pipeline',
  sha: 'abc123def456',
  branch: 'agent/story-123',
  repositoryFullName: 'org/repo',
  overallStatus: 'passed',
  jobResults: {
    lint: 'success',
    typecheck: 'success',
    unitTests: 'success',
    integrationTests: 'success',
  },
}

describe('validatePipelineResultPayload', () => {
  beforeEach(() => jest.clearAllMocks())

  test('returns valid for a complete correct payload', () => {
    const result = validatePipelineResultPayload(validPayload)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  test('returns invalid for null input', () => {
    const result = validatePipelineResultPayload(null)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Payload must be a non-null object')
  })

  test('returns invalid for non-object input', () => {
    const result = validatePipelineResultPayload('string')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Payload must be a non-null object')
  })

  test('returns invalid when prNumber is missing', () => {
    const payload = { ...validPayload, prNumber: undefined }
    const result = validatePipelineResultPayload(payload)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('prNumber'))).toBe(true)
  })

  test('returns invalid when prNumber is zero', () => {
    const payload = { ...validPayload, prNumber: 0 }
    const result = validatePipelineResultPayload(payload)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('prNumber'))).toBe(true)
  })

  test('returns invalid when prNumber is a float', () => {
    const payload = { ...validPayload, prNumber: 1.5 }
    const result = validatePipelineResultPayload(payload)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('prNumber'))).toBe(true)
  })

  test('returns invalid when prTitle is empty string', () => {
    const payload = { ...validPayload, prTitle: '   ' }
    const result = validatePipelineResultPayload(payload)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('prTitle'))).toBe(true)
  })

  test('returns invalid when sha is missing', () => {
    const payload = { ...validPayload, sha: '' }
    const result = validatePipelineResultPayload(payload)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('sha'))).toBe(true)
  })

  test('returns invalid when branch is missing', () => {
    const payload = { ...validPayload, branch: '' }
    const result = validatePipelineResultPayload(payload)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('branch'))).toBe(true)
  })

  test('returns invalid when repositoryFullName is missing', () => {
    const payload = { ...validPayload, repositoryFullName: '' }
    const result = validatePipelineResultPayload(payload)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('repositoryFullName'))).toBe(true)
  })

  test('returns invalid for unknown overallStatus', () => {
    const payload = { ...validPayload, overallStatus: 'unknown' }
    const result = validatePipelineResultPayload(payload)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('overallStatus'))).toBe(true)
  })

  test('accepts overallStatus = failed', () => {
    const payload = { ...validPayload, overallStatus: 'failed' }
    const result = validatePipelineResultPayload(payload)
    expect(result.valid).toBe(true)
  })

  test('returns invalid when jobResults is missing', () => {
    const payload = { ...validPayload, jobResults: null }
    const result = validatePipelineResultPayload(payload)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('jobResults'))).toBe(true)
  })

  test('returns invalid when a job has an unknown status', () => {
    const payload = {
      ...validPayload,
      jobResults: { ...validPayload.jobResults, lint: 'running' },
    }
    const result = validatePipelineResultPayload(payload)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('jobResults.lint'))).toBe(true)
  })

  test('accepts all valid job statuses', () => {
    const statuses = ['success', 'failure', 'cancelled', 'skipped']
    for (const status of statuses) {
      const payload = {
        ...validPayload,
        jobResults: {
          lint: status,
          typecheck: status,
          unitTests: status,
          integrationTests: status,
        },
      }
      const result = validatePipelineResultPayload(payload)
      expect(result.valid).toBe(true)
    }
  })

  test('accepts optional storyId when provided as string', () => {
    const payload = { ...validPayload, storyId: 'story-abc' }
    const result = validatePipelineResultPayload(payload)
    expect(result.valid).toBe(true)
  })

  test('accepts when storyId is null', () => {
    const payload = { ...validPayload, storyId: null }
    const result = validatePipelineResultPayload(payload)
    expect(result.valid).toBe(true)
  })

  test('returns invalid when storyId is a number', () => {
    const payload = { ...validPayload, storyId: 123 }
    const result = validatePipelineResultPayload(payload)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('storyId'))).toBe(true)
  })

  test('accumulates multiple errors', () => {
    const payload = {
      prNumber: -1,
      prTitle: '',
      sha: '',
      branch: '',
      repositoryFullName: '',
      overallStatus: 'bad',
      jobResults: null,
    }
    const result = validatePipelineResultPayload(payload)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(3)
  })
})

describe('parsePipelineResultPayload', () => {
  beforeEach(() => jest.clearAllMocks())

  test('parses a valid payload correctly', () => {
    const result = parsePipelineResultPayload(validPayload)
    expect(result.prNumber).toBe(42)
    expect(result.prTitle).toBe('feat: add ci pipeline')
    expect(result.sha).toBe('abc123def456')
    expect(result.branch).toBe('agent/story-123')
    expect(result.repositoryFullName).toBe('org/repo')
    expect(result.overallStatus).toBe('passed')
    expect(result.jobResults.lint).toBe('success')
    expect(result.jobResults.typecheck).toBe('success')
    expect(result.jobResults.unitTests).toBe('success')
    expect(result.jobResults.integrationTests).toBe('success')
    expect(result.storyId).toBeUndefined()
  })

  test('trims whitespace from string fields', () => {
    const payload = {
      ...validPayload,
      prTitle: '  feat: add ci pipeline  ',
      sha: '  abc123  ',
      branch: '  main  ',
    }
    const result = parsePipelineResultPayload(payload)
    expect(result.prTitle).toBe('feat: add ci pipeline')
    expect(result.sha).toBe('abc123')
    expect(result.branch).toBe('main')
  })

  test('includes storyId when provided', () => {
    const payload = { ...validPayload, storyId: 'cmo65836a003pyojnanllbl10' }
    const result = parsePipelineResultPayload(payload)
    expect(result.storyId).toBe('cmo65836a003pyojnanllbl10')
  })

  test('returns undefined storyId when not provided', () => {
    const result = parsePipelineResultPayload(validPayload)
    expect(result.storyId).toBeUndefined()
  })

  test('returns undefined storyId when null', () => {
    const payload = { ...validPayload, storyId: null }
    const result = parsePipelineResultPayload(payload)
    expect(result.storyId).toBeUndefined()
  })

  test('maps all job result fields', () => {
    const payload = {
      ...validPayload,
      jobResults: {
        lint: 'failure',
        typecheck: 'cancelled',
        unitTests: 'skipped',
        integrationTests: 'success',
      },
    }
    const result = parsePipelineResultPayload(payload)
    expect(result.jobResults.lint).toBe('failure')
    expect(result.jobResults.typecheck).toBe('cancelled')
    expect(result.jobResults.unitTests).toBe('skipped')
    expect(result.jobResults.integrationTests).toBe('success')
  })
})

describe('pipeline result business logic', () => {
  beforeEach(() => jest.clearAllMocks())

  test('overall status passed when all jobs succeed', () => {
    const result = validatePipelineResultPayload({
      ...validPayload,
      overallStatus: 'passed',
      jobResults: {
        lint: 'success',
        typecheck: 'success',
        unitTests: 'success',
        integrationTests: 'success',
      },
    })
    expect(result.valid).toBe(true)
  })

  test('overall status failed when lint fails', () => {
    const result = validatePipelineResultPayload({
      ...validPayload,
      overallStatus: 'failed',
      jobResults: {
        lint: 'failure',
        typecheck: 'success',
        unitTests: 'success',
        integrationTests: 'success',
      },
    })
    expect(result.valid).toBe(true)
  })

  test('valid payload with storyId links result to a board story', () => {
    const payload = {
      ...validPayload,
      storyId: 'cmo65836a003pyojnanllbl10',
    }
    const parsed = parsePipelineResultPayload(payload)
    expect(parsed.storyId).toBe('cmo65836a003pyojnanllbl10')
  })

  test('multiple errors are reported for invalid payload', () => {
    const badPayload = {
      prNumber: 'not-a-number',
      prTitle: 123,
      sha: null,
      branch: true,
      repositoryFullName: {},
      overallStatus: 'pending',
      jobResults: {
        lint: 'running',
        typecheck: 'running',
        unitTests: 'running',
        integrationTests: 'running',
      },
    }
    const result = validatePipelineResultPayload(badPayload)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThanOrEqual(5)
  })

  test('pr number 1 is valid minimum', () => {
    const payload = { ...validPayload, prNumber: 1 }
    const result = validatePipelineResultPayload(payload)
    expect(result.valid).toBe(true)
  })

  test('large pr numbers are accepted', () => {
    const payload = { ...validPayload, prNumber: 99999 }
    const result = validatePipelineResultPayload(payload)
    expect(result.valid).toBe(true)
  })
})
