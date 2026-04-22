import { createHash } from 'crypto'

// ── Normalization ─────────────────────────────────────────────────────────────

const STOP_WORDS = new Set(['a', 'an', 'the', 'of', 'for', 'to', 'in', 'on', 'at', 'is', 'are', 'was', 'were', 'be', 'by', 'and', 'or', 'with'])

const SYNONYMS: Record<string, string> = {
  'user stories': 'story',
  'user story':   'story',
  'stories':      'story',
  'epics':        'epic',
  'features':     'feature',
  'tasks':        'task',
  'risks':        'risk',
  'milestones':   'milestone',
  'workstreams':  'workstream',
  'acceptance criteria': 'ac',
  'acceptance criterion': 'ac',
}

export function normalizeText(raw: string): string {
  let s = raw

  // 1. Unicode NFC → NFD to decompose diacritics, then strip combining chars
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // 2. Lowercase + trim
  s = s.toLowerCase().trim()

  // 3. Replace & with and
  s = s.replace(/&/g, 'and')

  // 4. Apply multi-word synonyms first (before splitting)
  for (const [from, to] of Object.entries(SYNONYMS)) {
    s = s.replace(new RegExp(`\\b${from}\\b`, 'g'), to)
  }

  // 5. Remove punctuation (keep alphanumeric + spaces)
  s = s.replace(/[^\w\s]/g, ' ')

  // 6. Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim()

  // 7. Remove stop words
  s = s.split(' ').filter(w => w && !STOP_WORDS.has(w)).join(' ')

  return s
}

// ── Fingerprint builder ───────────────────────────────────────────────────────

export interface FingerprintInput {
  action: string       // create | update | delete | reparent | comment
  entityType: string   // epic | feature | story | task | risk | milestone | workstream
  target: string       // title or description of the thing being acted on
  scopeKey: string     // e.g. "project:abc123" or "project:abc123|entity:story_456"
}

export function buildFingerprintReadable(input: FingerprintInput): string {
  const action     = normalizeText(input.action)
  const entityType = normalizeText(input.entityType)
  const target     = normalizeText(input.target)
  const scope      = input.scopeKey.toLowerCase().trim()
  return `${action}|${entityType}|${target}|${scope}`
}

export function hashFingerprint(readable: string): string {
  return createHash('sha256').update(readable, 'utf8').digest('hex')
}

export function buildFingerprint(input: FingerprintInput): { readable: string; hash: string } {
  const readable = buildFingerprintReadable(input)
  return { readable, hash: hashFingerprint(readable) }
}

// ── Scope key helpers ─────────────────────────────────────────────────────────

export function projectScope(projectId: string): string {
  return `project:${projectId}`
}

export function entityScope(projectId: string, entityType: string, entityId: string): string {
  return `project:${projectId}|entity:${entityType}_${entityId}`
}

// ── Convenience: build from a Change object (used in run route) ───────────────

export interface ChangeInput {
  action: string
  entityType?: string
  title?: string
  targetStoryTitle?: string
  projectId: string
  entityId?: string  // for update/reparent scoping
}

export function fingerprintFromChange(c: ChangeInput): { readable: string; hash: string } {
  const entityType = c.entityType ?? inferEntityType(c.action)
  const target = c.title ?? c.targetStoryTitle ?? ''
  const scopeKey = c.entityId
    ? entityScope(c.projectId, entityType, c.entityId)
    : projectScope(c.projectId)

  return buildFingerprint({ action: c.action, entityType, target, scopeKey })
}

function inferEntityType(action: string): string {
  if (action.includes('epic'))      return 'epic'
  if (action.includes('feature'))   return 'feature'
  if (action.includes('story'))     return 'story'
  if (action.includes('task'))      return 'task'
  if (action.includes('risk'))      return 'risk'
  if (action.includes('milestone')) return 'milestone'
  if (action.includes('workstream'))return 'workstream'
  return 'unknown'
}
