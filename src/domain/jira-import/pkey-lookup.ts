import { prisma } from '@/src/infrastructure/db/client'

export interface PkeyLookupResult {
  entityType: 'story' | 'epic'
  id: string
  title: string
  pkey: string
}

export async function findExistingByPkey(
  pkey: string
): Promise<PkeyLookupResult | null> {
  const pkeyPrefix = pkey + ' '
  const pkeyExact = pkey

  const epic = await prisma.epic.findFirst({
    where: {
      OR: [
        { title: pkeyExact },
        { title: { startsWith: pkeyPrefix } },
      ],
    },
  })

  if (epic) {
    return {
      entityType: 'epic',
      id: epic.id,
      title: epic.title,
      pkey,
    }
  }

  const story = await prisma.story.findFirst({
    where: {
      OR: [
        { title: pkeyExact },
        { title: { startsWith: pkeyPrefix } },
      ],
    },
  })

  if (story) {
    return {
      entityType: 'story',
      id: story.id,
      title: story.title,
      pkey,
    }
  }

  return null
}

export function isPkeyFormat(value: string): boolean {
  return /^[A-Z][A-Z0-9]*-\d+$/.test(value)
}

export function extractPkeysFromBatch<T extends { pkey: string }>(records: T[]): string[] {
  return records.map((r) => r.pkey).filter(isPkeyFormat)
}
