import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

export const ALLOWED_ROOTS = ['src', 'prisma', 'tests', 'app']
const MAX_FILE_BYTES = 500 * 1024 // 500 KB

export class PathNotAllowedError extends Error { constructor(p: string) { super(`Path not allowed: ${p}`) } }
export class FileTooLargeError extends Error { constructor(p: string, size: number) { super(`File too large: ${p} (${size} bytes, max ${MAX_FILE_BYTES})`) } }
export class FileNotFoundError extends Error { constructor(p: string) { super(`File not found: ${p}`) } }

export interface FileEntry {
  path: string
  type: 'file' | 'dir'
  size?: number
}

export interface FileIOAuditEntry {
  agentId: string
  sessionId: string
  operation: 'list_files' | 'read_file' | 'write_file' | 'get_diff'
  path: string
  timestamp: Date
  success: boolean
  errorMsg?: string
}

/**
 * Resolves and validates a user-supplied path against the allowlist.
 * Throws PathNotAllowedError on any traversal attempt or disallowed root.
 */
export function resolveAndValidate(projectRoot: string, userPath: string): string {
  const normalised = path.posix.normalize(userPath).replace(/^\/+/, '')
  const resolved = path.resolve(projectRoot, normalised)

  // Must be within projectRoot
  if (!resolved.startsWith(projectRoot + path.sep) && resolved !== projectRoot) {
    throw new PathNotAllowedError(userPath)
  }

  // First segment must be an allowed root
  const firstSegment = normalised.split(path.sep)[0]
  if (!ALLOWED_ROOTS.includes(firstSegment)) {
    throw new PathNotAllowedError(userPath)
  }

  return resolved
}

export class FileIOService {
  constructor(
    private readonly projectRoot: string,
    private readonly agentId: string,
    private readonly sessionId: string,
    private readonly auditFn: (entry: FileIOAuditEntry) => Promise<void>,
  ) {}

  private async audit(
    op: FileIOAuditEntry['operation'],
    filePath: string,
    success: boolean,
    errorMsg?: string,
  ) {
    await this.auditFn({ agentId: this.agentId, sessionId: this.sessionId, operation: op, path: filePath, timestamp: new Date(), success, errorMsg }).catch(() => {})
  }

  async listFiles(dirPath: string): Promise<FileEntry[]> {
    try {
      const resolved = resolveAndValidate(this.projectRoot, dirPath)
      const entries: FileEntry[] = []
      const walk = (dir: string, rel: string) => {
        const items = fs.readdirSync(dir, { withFileTypes: true })
        for (const item of items) {
          const itemRel = rel ? `${rel}/${item.name}` : item.name
          if (item.isDirectory()) {
            entries.push({ path: itemRel, type: 'dir' })
            walk(path.join(dir, item.name), itemRel)
          } else {
            const stat = fs.statSync(path.join(dir, item.name))
            entries.push({ path: itemRel, type: 'file', size: stat.size })
          }
        }
      }
      const relBase = path.relative(this.projectRoot, resolved)
      walk(resolved, relBase)
      await this.audit('list_files', dirPath, true)
      return entries
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await this.audit('list_files', dirPath, false, msg)
      throw err
    }
  }

  async readFile(filePath: string): Promise<string> {
    try {
      const resolved = resolveAndValidate(this.projectRoot, filePath)
      if (!fs.existsSync(resolved)) throw new FileNotFoundError(filePath)
      const stat = fs.statSync(resolved)
      if (stat.size > MAX_FILE_BYTES) throw new FileTooLargeError(filePath, stat.size)
      const content = fs.readFileSync(resolved, 'utf-8')
      await this.audit('read_file', filePath, true)
      return content
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await this.audit('read_file', filePath, false, msg)
      throw err
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      const resolved = resolveAndValidate(this.projectRoot, filePath)
      fs.mkdirSync(path.dirname(resolved), { recursive: true })
      fs.writeFileSync(resolved, content, 'utf-8')
      await this.audit('write_file', filePath, true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await this.audit('write_file', filePath, false, msg)
      throw err
    }
  }

  async getDiff(): Promise<string> {
    try {
      let diff = ''
      try {
        diff = execSync('git diff HEAD', { cwd: this.projectRoot, encoding: 'utf-8', timeout: 5000 })
      } catch {
        diff = ''
      }
      await this.audit('get_diff', '.', true)
      return diff
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await this.audit('get_diff', '.', false, msg)
      throw err
    }
  }
}
