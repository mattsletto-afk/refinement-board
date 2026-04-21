import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FileIOService, PathNotAllowedError, FileTooLargeError, FileNotFoundError, resolveAndValidate, ALLOWED_ROOTS } from '../FileIOService'
import path from 'path'
import fs from 'fs'

vi.mock('fs')
vi.mock('child_process', () => ({ execSync: vi.fn(() => 'diff --git a/src/foo.ts b/src/foo.ts\n') }))

const PROJECT_ROOT = '/project'
const noopAudit = vi.fn().mockResolvedValue(undefined)

function makeSvc() {
  return new FileIOService(PROJECT_ROOT, 'agent-1', 'session-1', noopAudit)
}

beforeEach(() => {
  vi.clearAllMocks()
  noopAudit.mockResolvedValue(undefined)
})

// ── resolveAndValidate ────────────────────────────────────────────────────────

describe('resolveAndValidate', () => {
  it('accepts paths within allowed roots', () => {
    for (const root of ALLOWED_ROOTS) {
      expect(() => resolveAndValidate(PROJECT_ROOT, `${root}/foo.ts`)).not.toThrow()
    }
  })

  it('rejects path traversal with ../', () => {
    expect(() => resolveAndValidate(PROJECT_ROOT, '../../etc/passwd')).toThrow(PathNotAllowedError)
  })

  it('rejects paths outside allowed roots', () => {
    expect(() => resolveAndValidate(PROJECT_ROOT, 'node_modules/evil')).toThrow(PathNotAllowedError)
    expect(() => resolveAndValidate(PROJECT_ROOT, '.env')).toThrow(PathNotAllowedError)
  })

  it('rejects subtle traversal after normalisation', () => {
    expect(() => resolveAndValidate(PROJECT_ROOT, 'src/../../etc/passwd')).toThrow(PathNotAllowedError)
  })
})

// ── readFile ──────────────────────────────────────────────────────────────────

describe('FileIOService.readFile', () => {
  it('returns file content for a valid path', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.statSync).mockReturnValue({ size: 100 } as fs.Stats)
    vi.mocked(fs.readFileSync).mockReturnValue('export const x = 1')

    const svc = makeSvc()
    const content = await svc.readFile('src/foo.ts')
    expect(content).toBe('export const x = 1')
  })

  it('throws FileNotFoundError when file does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    await expect(makeSvc().readFile('src/missing.ts')).rejects.toThrow(FileNotFoundError)
  })

  it('throws FileTooLargeError when file exceeds 500KB', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.statSync).mockReturnValue({ size: 600 * 1024 } as fs.Stats)
    await expect(makeSvc().readFile('src/big.ts')).rejects.toThrow(FileTooLargeError)
  })

  it('throws PathNotAllowedError for path traversal', async () => {
    await expect(makeSvc().readFile('../../etc/passwd')).rejects.toThrow(PathNotAllowedError)
  })

  it('logs audit entry on success', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.statSync).mockReturnValue({ size: 50 } as fs.Stats)
    vi.mocked(fs.readFileSync).mockReturnValue('content')
    await makeSvc().readFile('src/x.ts')
    expect(noopAudit).toHaveBeenCalledWith(expect.objectContaining({ operation: 'read_file', success: true }))
  })

  it('logs audit entry on failure', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    await makeSvc().readFile('src/missing.ts').catch(() => {})
    expect(noopAudit).toHaveBeenCalledWith(expect.objectContaining({ operation: 'read_file', success: false }))
  })
})

// ── writeFile ────────────────────────────────────────────────────────────────

describe('FileIOService.writeFile', () => {
  it('writes content to a valid path', async () => {
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined)
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined)
    await makeSvc().writeFile('src/new.ts', 'const x = 1')
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      path.resolve(PROJECT_ROOT, 'src/new.ts'),
      'const x = 1',
      'utf-8',
    )
  })

  it('throws PathNotAllowedError for path outside allowlist', async () => {
    await expect(makeSvc().writeFile('node_modules/bad.js', 'evil')).rejects.toThrow(PathNotAllowedError)
  })
})

// ── getDiff ───────────────────────────────────────────────────────────────────

describe('FileIOService.getDiff', () => {
  it('returns unified diff string', async () => {
    const diff = await makeSvc().getDiff()
    expect(diff).toContain('diff --git')
  })

  it('logs audit entry', async () => {
    await makeSvc().getDiff()
    expect(noopAudit).toHaveBeenCalledWith(expect.objectContaining({ operation: 'get_diff' }))
  })
})
