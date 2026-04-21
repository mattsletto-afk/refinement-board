import { prisma } from '@/src/infrastructure/db/client'
import { randomUUID } from 'crypto'
import type { FileIOAuditEntry } from '@/src/domain/fileIO/FileIOService'

export async function ensureFileAuditTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS AgentFileAudit (
      id         TEXT PRIMARY KEY,
      agentId    TEXT NOT NULL,
      sessionId  TEXT NOT NULL,
      operation  TEXT NOT NULL,
      path       TEXT NOT NULL,
      success    INTEGER NOT NULL DEFAULT 1,
      errorMsg   TEXT,
      timestamp  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_file_audit_agent ON AgentFileAudit(agentId)
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_file_audit_session ON AgentFileAudit(sessionId)
  `)
}

export async function logFileAudit(entry: FileIOAuditEntry): Promise<void> {
  await ensureFileAuditTable()
  await prisma.$executeRawUnsafe(
    `INSERT INTO AgentFileAudit (id, agentId, sessionId, operation, path, success, errorMsg, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    entry.agentId,
    entry.sessionId,
    entry.operation,
    entry.path,
    entry.success ? 1 : 0,
    entry.errorMsg ?? null,
    entry.timestamp.toISOString(),
  )
}
