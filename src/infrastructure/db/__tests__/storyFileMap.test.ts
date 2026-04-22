import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/src/infrastructure/db/client', () => ({
  prisma: {
    storyFileMap: {
      upsert:     vi.fn(),
      findMany:   vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/src/infrastructure/db/client'
import {
  mapFileToStory,
  getFilesForStory,
  getStoriesForFile,
  removeFileMapping,
  getMissingFiles,
} from '../storyFileMap'

const db = prisma.storyFileMap as unknown as {
  upsert:     ReturnType<typeof vi.fn>
  findMany:   ReturnType<typeof vi.fn>
  deleteMany: ReturnType<typeof vi.fn>
}

const mockRecord = {
  id: 'rec-1',
  projectId: 'proj-1',
  storyId: 'story-1',
  relativePath: 'src/foo.ts',
  fileType: 'implementation' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(() => vi.clearAllMocks())

describe('mapFileToStory', () => {
  it('upserts and returns the record', async () => {
    db.upsert.mockResolvedValue(mockRecord)
    const result = await mapFileToStory('proj-1', 'story-1', 'src/foo.ts')
    expect(result.relativePath).toBe('src/foo.ts')
    expect(db.upsert).toHaveBeenCalledOnce()
  })

  it('defaults fileType to implementation', async () => {
    db.upsert.mockResolvedValue(mockRecord)
    await mapFileToStory('proj-1', 'story-1', 'src/foo.ts')
    expect(db.upsert.mock.calls[0][0].create.fileType).toBe('implementation')
  })

  it('passes explicit fileType through', async () => {
    db.upsert.mockResolvedValue({ ...mockRecord, fileType: 'test' })
    await mapFileToStory('proj-1', 'story-1', 'src/foo.test.ts', 'test')
    expect(db.upsert.mock.calls[0][0].create.fileType).toBe('test')
  })
})

describe('getFilesForStory', () => {
  it('returns records ordered by path', async () => {
    db.findMany.mockResolvedValue([mockRecord])
    const result = await getFilesForStory('story-1')
    expect(result).toHaveLength(1)
    expect(db.findMany.mock.calls[0][0].orderBy).toEqual({ relativePath: 'asc' })
  })
})

describe('getStoriesForFile', () => {
  it('queries by projectId and relativePath', async () => {
    db.findMany.mockResolvedValue([mockRecord])
    const result = await getStoriesForFile('proj-1', 'src/foo.ts')
    expect(result).toHaveLength(1)
    expect(db.findMany.mock.calls[0][0].where).toMatchObject({ projectId: 'proj-1', relativePath: 'src/foo.ts' })
  })
})

describe('removeFileMapping', () => {
  it('calls deleteMany with correct args', async () => {
    db.deleteMany.mockResolvedValue({ count: 1 })
    await removeFileMapping('story-1', 'src/foo.ts')
    expect(db.deleteMany).toHaveBeenCalledWith({ where: { storyId: 'story-1', relativePath: 'src/foo.ts' } })
  })
})

describe('getMissingFiles', () => {
  it('returns paths not in existingPaths set', async () => {
    db.findMany.mockResolvedValue([
      { ...mockRecord, relativePath: 'src/a.ts' },
      { ...mockRecord, relativePath: 'src/b.ts' },
    ])
    const missing = await getMissingFiles('story-1', new Set(['src/a.ts']))
    expect(missing).toEqual(['src/b.ts'])
  })

  it('returns empty array when all files exist', async () => {
    db.findMany.mockResolvedValue([{ ...mockRecord, relativePath: 'src/a.ts' }])
    const missing = await getMissingFiles('story-1', new Set(['src/a.ts']))
    expect(missing).toHaveLength(0)
  })

  it('ignores non-implementation files', async () => {
    db.findMany.mockResolvedValue([
      { ...mockRecord, relativePath: 'src/a.ts', fileType: 'test' },
    ])
    const missing = await getMissingFiles('story-1', new Set())
    expect(missing).toHaveLength(0)
  })
})
