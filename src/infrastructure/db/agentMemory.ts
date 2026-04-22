import { prisma } from '@/src/infrastructure/db/client'

export interface AgentMemoryRecord {
  id: string
  agentId: string
  projectId: string
  content: string
  runId: string | null
  createdAt: Date
  schemaVersion: number
  retentionExpires: Date | null
}

export interface WriteAgentMemoryInput {
  agentId: string
  projectId: string
  content: string
  runId?: string
}

export async function writeAgentMemory(input: WriteAgentMemoryInput): Promise<AgentMemoryRecord> {
  return prisma.agentMemory.create({
    data: {
      agentId: input.agentId,
      projectId: input.projectId,
      content: input.content,
      runId: input.runId ?? null,
    },
  })
}

export async function readAgentMemory(agentId: string, limit = 5): Promise<AgentMemoryRecord[]> {
  return prisma.agentMemory.findMany({
    where: { agentId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}
