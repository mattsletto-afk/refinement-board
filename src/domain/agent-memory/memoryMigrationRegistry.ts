export type MemoryContent = Record<string, unknown>

export type MigrationFn = (content: MemoryContent) => MemoryContent

export const CURRENT_SCHEMA_VERSION = 2

const migrations: Record<number, MigrationFn> = {
  1: (content: MemoryContent): MemoryContent => {
    return {
      ...content,
      migratedAt: new Date().toISOString(),
      version: 'v2',
    }
  },
}

export function migrateMemoryContent(
  content: MemoryContent,
  fromVersion: number,
  toVersion: number,
): MemoryContent {
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

export function isKnownVersion(version: number): boolean {
  if (version === CURRENT_SCHEMA_VERSION) return true
  for (let v = version; v < CURRENT_SCHEMA_VERSION; v++) {
    if (!migrations[v]) return false
  }
  return version >= 1 && version <= CURRENT_SCHEMA_VERSION
}
