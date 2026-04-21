/**
 * DB-backed job queue for simulation runs.
 * Uses raw SQL on a self-bootstrapping SimJob table so no migration is needed.
 *
 * Table: SimJob
 *   id            TEXT PRIMARY KEY
 *   simulationId  TEXT NOT NULL
 *   status        TEXT  -- queued | processing | completed | failed | dead-lettered
 *   retryCount    INTEGER DEFAULT 0
 *   maxRetries    INTEGER DEFAULT 3
 *   result        TEXT  (JSON, nullable — set on completion)
 *   errorMsg      TEXT
 *   nextRetryAt   DATETIME (nullable — set when scheduling a retry)
 *   createdAt     DATETIME
 *   startedAt     DATETIME
 *   completedAt   DATETIME
 */

import { prisma } from '@/src/infrastructure/db/client'
import { randomUUID } from 'crypto'

export type SimJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'dead-lettered'

export interface SimJob {
  id: string
  simulationId: string
  status: SimJobStatus
  retryCount: number
  maxRetries: number
  result: string | null
  errorMsg: string | null
  nextRetryAt: Date | null
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
}

interface SimJobRow {
  id: string
  simulationId: string
  status: string
  retryCount: number
  maxRetries: number
  result: string | null
  errorMsg: string | null
  nextRetryAt: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

function rowToJob(row: SimJobRow): SimJob {
  return {
    id: row.id,
    simulationId: row.simulationId,
    status: row.status as SimJobStatus,
    retryCount: row.retryCount,
    maxRetries: row.maxRetries,
    result: row.result,
    errorMsg: row.errorMsg,
    nextRetryAt: row.nextRetryAt ? new Date(row.nextRetryAt) : null,
    createdAt: new Date(row.createdAt),
    startedAt: row.startedAt ? new Date(row.startedAt) : null,
    completedAt: row.completedAt ? new Date(row.completedAt) : null,
  }
}

export async function ensureSimJobTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS SimJob (
      id            TEXT PRIMARY KEY,
      simulationId  TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'queued',
      retryCount    INTEGER NOT NULL DEFAULT 0,
      maxRetries    INTEGER NOT NULL DEFAULT 3,
      result        TEXT,
      errorMsg      TEXT,
      nextRetryAt   DATETIME,
      createdAt     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      startedAt     DATETIME,
      completedAt   DATETIME
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_simjob_status ON SimJob(status)
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_simjob_simid ON SimJob(simulationId)
  `)
}

export async function enqueueSimJob(simulationId: string, maxRetries = 3): Promise<SimJob> {
  await ensureSimJobTable()
  const id = randomUUID()
  const now = new Date().toISOString()
  await prisma.$executeRawUnsafe(
    `INSERT INTO SimJob (id, simulationId, status, maxRetries, createdAt)
     VALUES (?, ?, 'queued', ?, ?)`,
    id, simulationId, maxRetries, now,
  )
  const rows = await prisma.$queryRawUnsafe<SimJobRow[]>(
    `SELECT * FROM SimJob WHERE id = ? LIMIT 1`, id,
  )
  return rowToJob(rows[0])
}

export async function getSimJob(jobId: string): Promise<SimJob | null> {
  await ensureSimJobTable()
  const rows = await prisma.$queryRawUnsafe<SimJobRow[]>(
    `SELECT * FROM SimJob WHERE id = ? LIMIT 1`, jobId,
  )
  return rows.length > 0 ? rowToJob(rows[0]) : null
}

export async function claimSimJob(jobId: string): Promise<boolean> {
  const now = new Date().toISOString()
  const affected = await prisma.$executeRawUnsafe(
    `UPDATE SimJob SET status = 'processing', startedAt = ?
     WHERE id = ? AND status IN ('queued')`,
    now, jobId,
  )
  return affected > 0
}

export async function markSimJobComplete(jobId: string, result: string): Promise<void> {
  const now = new Date().toISOString()
  await prisma.$executeRawUnsafe(
    `UPDATE SimJob SET status = 'completed', result = ?, completedAt = ?
     WHERE id = ?`,
    result, now, jobId,
  )
}

export async function markSimJobFailed(jobId: string, errorMsg: string): Promise<void> {
  await ensureSimJobTable()
  const rows = await prisma.$queryRawUnsafe<SimJobRow[]>(
    `SELECT retryCount, maxRetries FROM SimJob WHERE id = ? LIMIT 1`, jobId,
  )
  if (!rows.length) return

  const { retryCount, maxRetries } = rows[0]
  const newCount = retryCount + 1
  const now = new Date().toISOString()

  if (newCount >= maxRetries) {
    await prisma.$executeRawUnsafe(
      `UPDATE SimJob SET status = 'dead-lettered', retryCount = ?, errorMsg = ?, completedAt = ?
       WHERE id = ?`,
      newCount, errorMsg, now, jobId,
    )
  } else {
    // Exponential backoff: 30s * 2^retryCount
    const delaySec = 30 * Math.pow(2, retryCount)
    const nextRetryAt = new Date(Date.now() + delaySec * 1000).toISOString()
    await prisma.$executeRawUnsafe(
      `UPDATE SimJob SET status = 'queued', retryCount = ?, errorMsg = ?, nextRetryAt = ?
       WHERE id = ?`,
      newCount, errorMsg, nextRetryAt, jobId,
    )
  }
}

export async function dequeueSimJobs(limit = 5): Promise<SimJob[]> {
  await ensureSimJobTable()
  const now = new Date().toISOString()
  const rows = await prisma.$queryRawUnsafe<SimJobRow[]>(
    `SELECT * FROM SimJob
     WHERE status = 'queued'
       AND (nextRetryAt IS NULL OR nextRetryAt <= ?)
     ORDER BY createdAt ASC
     LIMIT ?`,
    now, limit,
  )
  return rows.map(rowToJob)
}

export async function listSimJobs(options?: {
  status?: SimJobStatus
  limit?: number
}): Promise<SimJob[]> {
  await ensureSimJobTable()
  let query = `SELECT * FROM SimJob WHERE 1=1`
  const args: unknown[] = []
  if (options?.status) {
    query += ` AND status = ?`
    args.push(options.status)
  }
  query += ` ORDER BY createdAt DESC LIMIT ?`
  args.push(options?.limit ?? 100)
  const rows = await prisma.$queryRawUnsafe<SimJobRow[]>(query, ...args)
  return rows.map(rowToJob)
}
