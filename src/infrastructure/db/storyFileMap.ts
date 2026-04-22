import { prisma } from '@/src/infrastructure/db/client'

export type FileType = 'implementation' | 'test' | 'config' | 'doc'

export interface StoryFileMapRecord {
  id:           string
  projectId:    string
  storyId:      string
  relativePath: string
  fileType:     FileType
  createdAt:    Date
  updatedAt:    Date
}

export async function mapFileToStory(
  projectId:    string,
  storyId:      string,
  relativePath: string,
  fileType:     FileType = 'implementation',
): Promise<StoryFileMapRecord> {
  const record = await prisma.storyFileMap.upsert({
    where:  { storyId_relativePath: { storyId, relativePath } },
    create: { projectId, storyId, relativePath, fileType },
    update: { fileType },
  })
  return record as StoryFileMapRecord
}

export async function getFilesForStory(storyId: string): Promise<StoryFileMapRecord[]> {
  return prisma.storyFileMap.findMany({
    where: { storyId },
    orderBy: { relativePath: 'asc' },
  }) as Promise<StoryFileMapRecord[]>
}

export async function getStoriesForFile(
  projectId:    string,
  relativePath: string,
): Promise<StoryFileMapRecord[]> {
  return prisma.storyFileMap.findMany({
    where: { projectId, relativePath },
  }) as Promise<StoryFileMapRecord[]>
}

export async function removeFileMapping(storyId: string, relativePath: string): Promise<void> {
  await prisma.storyFileMap.deleteMany({ where: { storyId, relativePath } })
}

/**
 * Completion detection: a story is "file-complete" when every mapped
 * implementation file exists on disk (checked by the caller).
 * Returns the list of paths that are missing.
 */
export async function getMissingFiles(
  storyId: string,
  existingPaths: Set<string>,
): Promise<string[]> {
  const maps = await getFilesForStory(storyId)
  const implFiles = maps.filter(m => m.fileType === 'implementation')
  return implFiles
    .map(m => m.relativePath)
    .filter(p => !existingPaths.has(p))
}
