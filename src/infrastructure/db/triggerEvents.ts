/**
 * DB-backed event queue for the trigger engine.
 * Uses the TriggerEvent table (raw SQL via Prisma's $executeRaw / $queryRaw)
 * so we don't require a schema migration in this story — we use a lightweight
 * JSON store pattern on top of a single table.
 *
 * Table: TriggerEvent
 *   id             TEXT PRIMARY KEY
 *   type           TEXT
 *   payload        TEXT  (JSON)
 *   idempotencyKey TEXT  UNIQUE
 *   status         TEXT
 *   retryCount     INTEGER DEFAULT 0
 *   maxRetries     INTEGER DEFAULT 3
 *   createdAt      DATETIME
 *   processedAt    DATETIME
 *   failedAt       DATETIME
 *   errorMessage   TEXT
 *   simulationId   TEXT
 */

import { prisma } from '@/src/infrastructure/db/client'
import { randomUUID } from 'crypto'
import type {
  SimulationEvent,
  CreateEventInput,
  EventType,
  EventStatus,
} from '@/src/domain/events/schema'
import { buildIdempotencyKey } from '@/src/domain/events/schema'

const DEDUP_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

// ---------------------------------------------------------------------------
// Schema bootstrap (idempotent)
// ---------------------------------------------------------------------------

export async function ensureTriggerEventTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS TriggerEvent (
      id             TEXT PRIMARY KEY,
      type           TEXT NOT NULL,
      payload        TEXT NOT NULL,
      idempotencyKey TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'queued',
      retryCount     INTEGER NOT NULL DEFAULT 0,
      maxRetries     INTEGER NOT NULL DEFAULT 3,
      createdAt      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processedAt    DATETIME,
      failedAt       DATETIME,
      errorMessage   TEXT,
      simulationId   TEXT
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_trigger_event_idempotency
    ON TriggerEvent(idempotencyKey)
  `)
}

// ---------------------------------------------------------------------------
// Row type (raw DB)
// ---------------------------------------------------------------------------

interface TriggerEventRow {
  id: string
  type: string
  payload: string
  idempotencyKey: string
  status: string
  retryCount: number
  maxRetries: number
  createdAt: string
  processedAt: string | null
  failedAt: string | null
  errorMessage: string | null
  simulationId: string | null
}

function rowToEvent(row: TriggerEventRow): SimulationEvent {
  return {
    id: row.id,
    type: row.type as EventType,
    payload: JSON.parse(row.payload),
    idempotencyKey: row.idempotencyKey,
    status: row.status as EventStatus,
    retryCount: row.retryCount,
    maxRetries: row.maxRetries,
    createdAt: new Date(row.createdAt),
    processedAt: row.processedAt ? new Date(row.processedAt) : undefined,
    failedAt: row.failedAt ? new Date(row.failedAt) : undefined,
    errorMessage: row.errorMessage ?? undefined,
    simulationId: row.simulationId ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

/**
 * Enqueue an event. Returns null if deduplicated within the 5-minute window.
 */
export async function enqueueEvent(
  input: CreateEventInput
): Promise<SimulationEvent | null> {
  await ensureTriggerEventTable()

  const idempotencyKey =
    input.idempotencyKey ?? buildIdempotencyKey(input.type, input.payload)

  // Deduplication: check for an existing event with the same key
  // created within the last 5 minutes that is not failed/dead-lettered
  const cutoff = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString()

  const existing = await prisma.$queryRawUnsafe<TriggerEventRow[]>(
    `SELECT * FROM TriggerEvent
     WHERE idempotencyKey = ?
       AND createdAt > ?
       AND status NOT IN ('failed', 'dead-lettered')
     LIMIT 1`,
    idempotencyKey,
    cutoff
  )

  if (existing.length > 0) {
    // Mark as deduplicated in the log but return null to signal no-op
    return null
  }

  // Remove stale events with the same key that are outside the dedup window or terminal,
  // so the INSERT doesn't hit the UNIQUE constraint on idempotencyKey.
  await prisma.$executeRawUnsafe(
    `DELETE FROM TriggerEvent
     WHERE idempotencyKey = ?
       AND (status IN ('dead-lettered', 'failed', 'completed', 'deduplicated') OR createdAt <= ?)`,
    idempotencyKey,
    cutoff
  )

  const id = randomUUID()
  const now = new Date().toISOString()
  const maxRetries = input.maxRetries ?? 3

  await prisma.$executeRawUnsafe(
    `INSERT INTO TriggerEvent
       (id, type, payload, idempotencyKey, status, retryCount, maxRetries, createdAt)
     VALUES (?, ?, ?, ?, 'queued', 0, ?, ?)`,
    id,
    input.type,
    JSON.stringify(input.payload),
    idempotencyKey,
    maxRetries,
    now
  )

  const rows = await prisma.$queryRawUnsafe<TriggerEventRow[]>(
    `SELECT * FROM TriggerEvent WHERE id = ? LIMIT 1`,
    id
  )

  return rows.length > 0 ? rowToEvent(rows[0]) : null
}

/**
 * Fetch the next batch of queued events to process.
 * Pass `type` to filter by event type at the DB level (avoids other event types crowding the batch).
 */
export async function dequeueEvents(
  limit = 10,
  type?: string
): Promise<SimulationEvent[]> {
  await ensureTriggerEventTable()

  const rows = type
    ? await prisma.$queryRawUnsafe<TriggerEventRow[]>(
        `SELECT * FROM TriggerEvent
         WHERE status = 'queued' AND type = ?
         ORDER BY createdAt ASC
         LIMIT ?`,
        type,
        limit
      )
    : await prisma.$queryRawUnsafe<TriggerEventRow[]>(
        `SELECT * FROM TriggerEvent
         WHERE status = 'queued'
         ORDER BY createdAt ASC
         LIMIT ?`,
        limit
      )

  return rows.map(rowToEvent)
}

/**
 * Mark an event as processing (optimistic lock via status check).
 */
export async function markProcessing(id: string): Promise<boolean> {
  const result = await prisma.$executeRawUnsafe(
    `UPDATE TriggerEvent
     SET status = 'processing'
     WHERE id = ? AND status = 'queued'`,
    id
  )
  return result > 0
}

/**
 * Mark an event as completed.
 */
export async function markCompleted(
  id: string,
  simulationId?: string
): Promise<void> {
  const now = new Date().toISOString()
  await prisma.$executeRawUnsafe(
    `UPDATE TriggerEvent
     SET status = 'completed', processedAt = ?, simulationId = ?
     WHERE id = ?`,
    now,
    simulationId ?? null,
    id
  )
}

/**
 * Mark an event as failed. If retries are exhausted, move to dead-letter queue.
 */
export async function markFailed(
  id: string,
  errorMessage: string
): Promise<void> {
  const now = new Date().toISOString()

  const rows = await prisma.$queryRawUnsafe<TriggerEventRow[]>(
    `SELECT retryCount, maxRetries FROM TriggerEvent WHERE id = ? LIMIT 1`,
    id
  )

  if (rows.length === 0) return

  const { retryCount, maxRetries } = rows[0]
  const newRetryCount = retryCount + 1

  if (newRetryCount >= maxRetries) {
    await prisma.$executeRawUnsafe(
      `UPDATE TriggerEvent
       SET status = 'dead-lettered', failedAt = ?, errorMessage = ?, retryCount = ?
       WHERE id = ?`,
      now,
      errorMessage,
      newRetryCount,
      id
    )
    await sendDeadLetterAlert(id, errorMessage)
  } else {
    // Requeue for retry
    await prisma.$executeRawUnsafe(
      `UPDATE TriggerEvent
       SET status = 'queued', failedAt = ?, errorMessage = ?, retryCount = ?
       WHERE id = ?`,
      now,
      errorMessage,
      newRetryCount,
      id
    )
  }
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export async function getEventById(id: string): Promise<SimulationEvent | null> {
  await ensureTriggerEventTable()
  const rows = await prisma.$queryRawUnsafe<TriggerEventRow[]>(
    `SELECT * FROM TriggerEvent WHERE id = ? LIMIT 1`,
    id
  )
  return rows.length > 0 ? rowToEvent(rows[0]) : null
}

export async function getDeadLetterEvents(): Promise<SimulationEvent[]> {
  await ensureTriggerEventTable()
  const rows = await prisma.$queryRawUnsafe<TriggerEventRow[]>(
    `SELECT * FROM TriggerEvent
     WHERE status = 'dead-lettered'
     ORDER BY failedAt DESC`
  )
  return rows.map(rowToEvent)
}

export async function listEvents(options?: {
  status?: EventStatus
  type?: EventType
  limit?: number
}): Promise<SimulationEvent[]> {
  await ensureTriggerEventTable()

  let query = `SELECT * FROM TriggerEvent WHERE 1=1`
  const args: unknown[] = []

  if (options?.status) {
    query += ` AND status = ?`
    args.push(options.status)
  }
  if (options?.type) {
    query += ` AND type = ?`
    args.push(options.type)
  }
  query += ` ORDER BY createdAt DESC LIMIT ?`
  args.push(options?.limit ?? 100)

  const rows = await prisma.$queryRawUnsafe<TriggerEventRow[]>(query, ...args)
  return rows.map(rowToEvent)
}

// ---------------------------------------------------------------------------
// Dead-letter alerting
// ---------------------------------------------------------------------------

async function sendDeadLetterAlert(
  eventId: string,
  errorMessage: string
): Promise<void> {
  // In production this would push to PagerDuty / Slack / SNS.
  // For now we log to stderr so it's observable in all environments.
  console.error(
    `[TriggerEngine] DEAD-LETTER ALERT — event ${eventId} exhausted retries. Error: ${errorMessage}`
  )
}
