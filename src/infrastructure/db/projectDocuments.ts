import { prisma } from '@/src/infrastructure/db/client'
import { randomUUID } from 'crypto'

export type DocumentType = 'spec' | 'adr' | 'runbook' | 'report' | 'changelog' | 'artifact'

export interface ProjectDocument {
  id: string
  projectId: string
  title: string
  type: DocumentType
  content: string
  storyId?: string
  agentRunId?: string
  generatedBy?: string
  createdAt: Date
  updatedAt: Date
}

export interface CreateDocumentInput {
  projectId: string
  title: string
  type: DocumentType
  content: string
  storyId?: string
  agentRunId?: string
  generatedBy?: string
}

export async function createDocument(input: CreateDocumentInput): Promise<ProjectDocument> {
  const doc = await prisma.projectDocument.create({
    data: {
      id: randomUUID(),
      ...input,
    },
  })
  return doc as unknown as ProjectDocument
}

export async function listDocuments(projectId: string, type?: DocumentType): Promise<ProjectDocument[]> {
  const docs = await prisma.projectDocument.findMany({
    where: { projectId, ...(type ? { type } : {}) },
    orderBy: { createdAt: 'desc' },
  })
  return docs as unknown as ProjectDocument[]
}

export async function getDocument(id: string): Promise<ProjectDocument | null> {
  const doc = await prisma.projectDocument.findUnique({ where: { id } })
  return doc as unknown as ProjectDocument | null
}
