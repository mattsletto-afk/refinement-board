/**
 * Migrate refinement-board v1 data into v2.
 * Creates a new Project in v2 and imports all Stories, Tasks, Personas, Posts.
 *
 * Run with:  npx tsx scripts/migrate-v1-to-v2.ts
 */

import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import path from 'path'

const V1_DB = path.resolve(__dirname, '../../refinement-board/dev.db')
const V2_DB = path.resolve(__dirname, '../dev.db')

const db1 = new Database(V1_DB)
const db2 = new Database(V2_DB)

// ── helpers ────────────────────────────────────────────────────────────────────

function normalizeStatus(s: string): string {
  const map: Record<string, string> = {
    Active: 'active', active: 'active',
    Done: 'done', done: 'done',
    Backlog: 'backlog', backlog: 'backlog',
    Archived: 'archived', archived: 'archived',
  }
  return map[s] ?? 'backlog'
}

function cuid(): string {
  return 'c' + randomUUID().replace(/-/g, '').slice(0, 24)
}

// ── load v1 data ───────────────────────────────────────────────────────────────

interface V1Story {
  id: string; title: string; userStory: string; businessProblem: string
  category: string | null; requesterGroup: string; valueScore: number
  riskScore: number; urgencyScore: number; effortScore: number
  meetingPoints: number; baseScore: number; finalScore: number
  status: string; notes: string; targetWindow: string | null
  inScope: number; board: string; rank: number; parentStoryId: string | null
  ownerText: string | null; legacyPriority: string | null
  sprintStream: string | null; sprintWeekStart: number | null; sprintWeekEnd: number | null
  createdAt: string; updatedAt: string
}

interface V1Task { id: string; storyId: string; title: string; status: string; sequence: number; createdAt: string; updatedAt: string }
interface V1Persona { id: string; name: string; piece: string | null; color: string | null; role: string | null; notes: string | null; agentType: string | null; model: string | null; createdAt: string; updatedAt: string }
interface V1Post { id: string; title: string | null; content: string; type: string; pinned: number; createdAt: string; updatedAt: string }
interface V1Placement { id: string; personaId: string; streamId: string; sequence: number }
interface V1Stream { id: string; name: string }

const v1Stories = db1.prepare('SELECT * FROM Story ORDER BY rank ASC').all() as V1Story[]
const v1Tasks = db1.prepare('SELECT * FROM Task').all() as V1Task[]
const v1Personas = db1.prepare('SELECT * FROM Persona').all() as V1Persona[]
const v1Posts = db1.prepare('SELECT * FROM Post').all() as V1Post[]
const v1Placements = db1.prepare('SELECT * FROM PersonaPlacement').all() as V1Placement[]
const v1Streams = db1.prepare('SELECT * FROM StreamConfig').all() as V1Stream[]

console.log(`V1 data: ${v1Stories.length} stories, ${v1Tasks.length} tasks, ${v1Personas.length} personas, ${v1Posts.length} posts`)

// ── create v2 project ─────────────────────────────────────────────────────────

const PROJECT_ID = 'v1-imported-project'
const now = new Date().toISOString()

db2.prepare(`INSERT OR IGNORE INTO Project (id, name, description, status, color, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
  PROJECT_ID,
  'My Project (imported from v1)',
  'Imported from Refinement Board v1',
  'active',
  '#0ea5e9',
  now, now,
)
console.log(`✓ Project created: ${PROJECT_ID}`)

// ── create workstreams from v1 streams ────────────────────────────────────────

const streamIdMap = new Map<string, string>() // v1 streamId → v2 workstreamId

for (const stream of v1Streams) {
  const wsId = cuid()
  streamIdMap.set(stream.id, wsId)
  db2.prepare(`INSERT OR IGNORE INTO Workstream (id, projectId, name, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?)`).run(wsId, PROJECT_ID, stream.name, now, now)
}
console.log(`✓ Created ${v1Streams.length} workstreams`)

// ── create categories ─────────────────────────────────────────────────────────

const categoryNames = [...new Set(v1Stories.map(s => s.category).filter(Boolean))] as string[]
const categoryIdMap = new Map<string, string>() // name → v2 categoryId

for (const name of categoryNames) {
  const id = cuid()
  categoryIdMap.set(name, id)
  db2.prepare(`INSERT OR IGNORE INTO Category (id, projectId, name, color, sequence, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, PROJECT_ID, name, '#6366f1', 0, now, now)
}
console.log(`✓ Created ${categoryNames.length} categories`)

// Disable FK checks for bulk insert (parent refs may not exist yet)
db2.pragma('foreign_keys = OFF')

// ── migrate stories ───────────────────────────────────────────────────────────

let storiesInserted = 0
const insertStory = db2.prepare(`
  INSERT OR IGNORE INTO UserStory
    (id, projectId, categoryId, parentStoryId, title, userStory, businessProblem,
     status, board, priority, valueScore, riskScore, urgencyScore, effortScore,
     meetingPoints, baseScore, finalScore, rank, inScope, targetWindow,
     requesterGroup, tags, notes, sprintWeekStart, sprintWeekEnd, sprintStream,
     createdAt, updatedAt)
  VALUES
    (?, ?, ?, ?, ?, ?, ?,
     ?, ?, ?, ?, ?, ?, ?,
     ?, ?, ?, ?, ?, ?,
     ?, ?, ?, ?, ?, ?,
     ?, ?)
`)

for (const s of v1Stories) {
  const categoryId = s.category ? (categoryIdMap.get(s.category) ?? null) : null
  const priority = s.legacyPriority?.toLowerCase() ?? 'medium'
  const normalPriority = ['low','medium','high','critical'].includes(priority) ? priority : 'medium'

  insertStory.run(
    s.id, PROJECT_ID, categoryId, s.parentStoryId,
    s.title, s.userStory ?? '', s.businessProblem ?? '',
    normalizeStatus(s.status), s.board ?? 'Current Backlog', normalPriority,
    s.valueScore ?? 3, s.riskScore ?? 3, s.urgencyScore ?? 3, s.effortScore ?? 3,
    s.meetingPoints ?? 0, s.baseScore ?? 0, s.finalScore ?? 0,
    s.rank ?? 0, s.inScope ? 1 : 0, s.targetWindow ?? null,
    s.requesterGroup ?? '', '', s.notes ?? '',
    s.sprintWeekStart ?? null, s.sprintWeekEnd ?? null, s.sprintStream ?? null,
    s.createdAt, s.updatedAt,
  )
  storiesInserted++
}
console.log(`✓ Migrated ${storiesInserted} stories`)

// ── migrate tasks ─────────────────────────────────────────────────────────────

let tasksInserted = 0
const insertTask = db2.prepare(`
  INSERT OR IGNORE INTO Task (id, projectId, storyId, title, status, sequence, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

for (const t of v1Tasks) {
  insertTask.run(t.id, PROJECT_ID, t.storyId, t.title, t.status ?? 'todo', t.sequence ?? 0, t.createdAt, t.updatedAt)
  tasksInserted++
}
console.log(`✓ Migrated ${tasksInserted} tasks`)

// ── migrate personas ──────────────────────────────────────────────────────────

let personasInserted = 0
const insertPersona = db2.prepare(`
  INSERT OR IGNORE INTO Persona
    (id, name, description, roleType, chesspiece, color, agentType, model, enabled, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

for (const p of v1Personas) {
  insertPersona.run(
    p.id, p.name,
    p.notes ?? null,
    p.role ?? null,
    p.piece ?? null,
    p.color ?? '#6366f1',
    p.agentType ?? null,
    p.model ?? null,
    1,
    p.createdAt, p.updatedAt,
  )
  personasInserted++
}
console.log(`✓ Migrated ${personasInserted} personas`)

// ── migrate persona placements ────────────────────────────────────────────────

let placementsInserted = 0
const insertPlacement = db2.prepare(`
  INSERT OR IGNORE INTO ProjectPersonaPlacement (id, projectId, personaId, workstreamId, sequence, createdAt)
  VALUES (?, ?, ?, ?, ?, ?)
`)

for (const pl of v1Placements) {
  const workstreamId = streamIdMap.get(pl.streamId) ?? null
  if (!workstreamId) continue
  insertPlacement.run(cuid(), PROJECT_ID, pl.personaId, workstreamId, pl.sequence ?? 0, now)
  placementsInserted++
}
console.log(`✓ Migrated ${placementsInserted} persona placements`)

// ── migrate posts ─────────────────────────────────────────────────────────────

let postsInserted = 0
const insertPost = db2.prepare(`
  INSERT OR IGNORE INTO Post (id, projectId, title, content, type, pinned, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

for (const p of v1Posts) {
  insertPost.run(p.id, PROJECT_ID, p.title ?? null, p.content ?? '', p.type ?? 'changelog', p.pinned ? 1 : 0, p.createdAt, p.updatedAt)
  postsInserted++
}
console.log(`✓ Migrated ${postsInserted} posts`)

db2.pragma('foreign_keys = ON')

// ── summary ───────────────────────────────────────────────────────────────────

console.log('\nMigration complete!')
console.log(`Open: http://localhost:3000/projects/${PROJECT_ID}/board`)

db1.close()
db2.close()
