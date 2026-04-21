import type { AgentMemory } from '@/app/generated/prisma'
import {
  CURRENT_SCHEMA_VERSION,
  isKnownVersion,
  migrateMemoryContent,
  type MemoryContent,
} from './memoryMigrationRegistry'

export type MigratedMemoryRecord = Omit<AgentMemory, 'schemaVersion'> & {
  schemaVersion: number
  content: string
  quarantined?: true
}

export function migrateMemoryRecord(record: AgentMemory): MigratedMemoryRecord | null {
  const version = record.schemaVersion

  if (!isKnownVersion(version)) {
    return null
  }

  if (version === CURRENT_SCHEMA_VERSION) {
    return record
  }

  let parsedContent: MemoryContent
  try {
    const parsed: unknown = JSON.parse(record.content)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      parsedContent = { raw: record.content }
    } else {
      parsedContent = parsed as MemoryContent
    }
  } catch {
    parsedContent = { raw: record.content }
  }

  const migratedContent = migrateMemoryContent(parsedContent, version, CURRENT_SCHEMA_VERSION)

  return {
    ...record,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    content: JSON.stringify(migratedContent),
  }
}
