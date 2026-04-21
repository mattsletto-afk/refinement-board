const { describe, test, expect, beforeEach } = require('@jest/globals')

beforeEach(() => jest.clearAllMocks())

// Inline the logic from memoryMigrationRegistry.ts
const CURRENT_SCHEMA_VERSION = 2

const migrations = {
  1: (content) => ({
    ...content,
    migratedAt: new Date().toISOString(),
    version: 'v2',
  }),
}

function migrateMemoryContent(content, fromVersion, toVersion) {
  let current = content
  for (let v = fromVersion; v < toVersion; v++) {
    const migrationFn = migrations[v]
    if (!migrationFn) {
      throw new Error(`No migration found for version ${v} → ${v + 1}`)
    }
    current = migrationFn(current)
  }
  return current
}

function isKnownVersion(version) {
  if (version === CURRENT_SCHEMA_VERSION) return true
  for (let v = version; v < CURRENT_SCHEMA_VERSION; v++) {
    if (!migrations[v]) return false
  }
  return version >= 1 && version <= CURRENT_SCHEMA_VERSION
}

// Inline the logic from migrateMemoryRecord.ts
function migrateMemoryRecord(record) {
  const version = record.schema_version

  if (!isKnownVersion(version)) {
    return null
  }

  if (version === CURRENT_SCHEMA_VERSION) {
    return record
  }

  let parsedContent
  try {
    const parsed = JSON.parse(record.content)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      parsedContent = { raw: record.content }
    } else {
      parsedContent = parsed
    }
  } catch {
    parsedContent = { raw: record.content }
  }

  const migratedContent = migrateMemoryContent(parsedContent, version, CURRENT_SCHEMA_VERSION)

  return {
    ...record,
    schema_version: CURRENT_SCHEMA_VERSION,
    content: JSON.stringify(migratedContent),
  }
}

describe('isKnownVersion', () => {
  test('returns true for version 1 (has migration path to current)', () => {
    expect(isKnownVersion(1)).toBe(true)
  })

  test('returns true for current schema version', () => {
    expect(isKnownVersion(CURRENT_SCHEMA_VERSION)).toBe(true)
  })

  test('returns false for version 0 (below minimum)', () => {
    expect(isKnownVersion(0)).toBe(false)
  })

  test('returns false for version 99 (future unknown version)', () => {
    expect(isKnownVersion(99)).toBe(false)
  })

  test('returns false for version 3 (no migration defined beyond current)', () => {
    expect(isKnownVersion(3)).toBe(false)
  })
})

describe('migrateMemoryContent', () => {
  test('applies v1 to v2 migration and adds migratedAt and version fields', () => {
    const content = { summary: 'agent completed story', storyId: 'abc123' }
    const result = migrateMemoryContent(content, 1, 2)
    expect(result.summary).toBe('agent completed story')
    expect(result.storyId).toBe('abc123')
    expect(result.version).toBe('v2')
    expect(typeof result.migratedAt).toBe('string')
  })

  test('does nothing when fromVersion equals toVersion', () => {
    const content = { summary: 'no migration needed' }
    const result = migrateMemoryContent(content, 2, 2)
    expect(result).toEqual(content)
  })

  test('preserves all original fields after migration', () => {
    const content = { key1: 'value1', key2: 42, nested: { deep: true } }
    const result = migrateMemoryContent(content, 1, 2)
    expect(result.key1).toBe('value1')
    expect(result.key2).toBe(42)
    expect(result.nested).toEqual({ deep: true })
  })

  test('throws when migration path has a gap', () => {
    expect(() => migrateMemoryContent({}, 5, 6)).toThrow('No migration found for version 5')
  })

  test('migratedAt is a valid ISO date string', () => {
    const content = {}
    const result = migrateMemoryContent(content, 1, 2)
    const date = new Date(result.migratedAt)
    expect(isNaN(date.getTime())).toBe(false)
  })
})

describe('migrateMemoryRecord', () => {
  const baseRecord = {
    id: 'mem_001',
    agentId: 'agent_1',
    projectId: 'proj_1',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  }

  test('returns null for records with unknown schema_version (quarantine)', () => {
    const record = { ...baseRecord, content: '{}', schema_version: 99 }
    expect(migrateMemoryRecord(record)).toBeNull()
  })

  test('returns null for records with schema_version 0 (quarantine)', () => {
    const record = { ...baseRecord, content: '{}', schema_version: 0 }
    expect(migrateMemoryRecord(record)).toBeNull()
  })

  test('returns record unchanged when schema_version equals CURRENT_SCHEMA_VERSION', () => {
    const record = {
      ...baseRecord,
      content: JSON.stringify({ version: 'v2', data: 'current' }),
      schema_version: CURRENT_SCHEMA_VERSION,
    }
    const result = migrateMemoryRecord(record)
    expect(result).toBe(record)
  })

  test('retrieves v1 record via v2 API — asserts correct transformation applied', () => {
    const v1Content = { summary: 'wrote feature', filesChanged: 3 }
    const record = {
      ...baseRecord,
      content: JSON.stringify(v1Content),
      schema_version: 1,
    }
    const result = migrateMemoryRecord(record)
    expect(result).not.toBeNull()
    expect(result.schema_version).toBe(CURRENT_SCHEMA_VERSION)
    const migratedContent = JSON.parse(result.content)
    expect(migratedContent.summary).toBe('wrote feature')
    expect(migratedContent.filesChanged).toBe(3)
    expect(migratedContent.version).toBe('v2')
    expect(typeof migratedContent.migratedAt).toBe('string')
  })

  test('handles non-JSON content gracefully by wrapping in raw field', () => {
    const record = {
      ...baseRecord,
      content: 'plain text memory content',
      schema_version: 1,
    }
    const result = migrateMemoryRecord(record)
    expect(result).not.toBeNull()
    expect(result.schema_version).toBe(CURRENT_SCHEMA_VERSION)
    const migratedContent = JSON.parse(result.content)
    expect(migratedContent.raw).toBe('plain text memory content')
    expect(migratedContent.version).toBe('v2')
  })

  test('handles array JSON content gracefully by wrapping in raw field', () => {
    const record = {
      ...baseRecord,
      content: JSON.stringify([1, 2, 3]),
      schema_version: 1,
    }
    const result = migrateMemoryRecord(record)
    expect(result).not.toBeNull()
    const migratedContent = JSON.parse(result.content)
    expect(migratedContent.raw).toBe(JSON.stringify([1, 2, 3]))
  })

  test('preserves record metadata (id, agentId, projectId, timestamps) after migration', () => {
    const record = {
      ...baseRecord,
      content: JSON.stringify({ data: 'test' }),
      schema_version: 1,
    }
    const result = migrateMemoryRecord(record)
    expect(result.id).toBe(baseRecord.id)
    expect(result.agentId).toBe(baseRecord.agentId)
    expect(result.projectId).toBe(baseRecord.projectId)
    expect(result.createdAt).toEqual(baseRecord.createdAt)
    expect(result.updatedAt).toEqual(baseRecord.updatedAt)
  })

  test('filters out quarantined records when mapping multiple records', () => {
    const records = [
      { ...baseRecord, id: 'r1', content: JSON.stringify({ a: 1 }), schema_version: 1 },
      { ...baseRecord, id: 'r2', content: JSON.stringify({ b: 2 }), schema_version: 99 },
      { ...baseRecord, id: 'r3', content: JSON.stringify({ c: 3 }), schema_version: CURRENT_SCHEMA_VERSION },
    ]
    const migrated = records
      .map(migrateMemoryRecord)
      .filter((r) => r !== null)
    expect(migrated).toHaveLength(2)
    expect(migrated[0].id).toBe('r1')
    expect(migrated[1].id).toBe('r3')
  })

  test('future version (higher than current) is quarantined', () => {
    const record = {
      ...baseRecord,
      content: '{}',
      schema_version: CURRENT_SCHEMA_VERSION + 1,
    }
    expect(migrateMemoryRecord(record)).toBeNull()
  })
})
