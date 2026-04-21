import { prisma } from '@/src/infrastructure/db/client'

const AGENT_MEMORY_TTL_DAYS        = parseInt(process.env.AGENT_MEMORY_TTL_DAYS        ?? '90',  10)
const AGENT_MEMORY_CAP_PER_PERSONA = parseInt(process.env.AGENT_MEMORY_CAP_PER_PERSONA ?? '500', 10)

export interface EvictionResult {
  agentId:    string
  projectId:  string
  deletedTtl: number
  deletedCap: number
}

/**
 * Prunes AgentMemory records for a given agentId + projectId:
 * 1. Deletes records older than AGENT_MEMORY_TTL_DAYS
 * 2. If count still > AGENT_MEMORY_CAP_PER_PERSONA, deletes the oldest records
 *    (sorted by createdAt asc — lowest relevance heuristic)
 */
export async function pruneAgentMemory(
  agentId:   string,
  projectId: string,
): Promise<EvictionResult> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - AGENT_MEMORY_TTL_DAYS)

  // Step 1: Delete by TTL
  const ttlResult = await prisma.agentMemory.deleteMany({
    where: {
      agentId,
      projectId,
      createdAt: { lt: cutoffDate },
    },
  })
  const deletedTtl = ttlResult.count

  // Step 2: Enforce cap (delete oldest — lowest recency = lowest relevance)
  const remaining = await prisma.agentMemory.count({ where: { agentId, projectId } })
  let deletedCap = 0

  if (remaining > AGENT_MEMORY_CAP_PER_PERSONA) {
    const excess = remaining - AGENT_MEMORY_CAP_PER_PERSONA
    const toDelete = await prisma.agentMemory.findMany({
      where:   { agentId, projectId },
      orderBy: { createdAt: 'asc' },
      take:    excess,
      select:  { id: true },
    })
    const ids = toDelete.map((r) => r.id)
    const capResult = await prisma.agentMemory.deleteMany({ where: { id: { in: ids } } })
    deletedCap = capResult.count
  }

  return { agentId, projectId, deletedTtl, deletedCap }
}

/**
 * Prunes memory for all agent+project combinations in the given project.
 */
export async function pruneAllAgentsForProject(projectId: string): Promise<EvictionResult[]> {
  const agents = await prisma.agentMemory.groupBy({
    by:    ['agentId'],
    where: { projectId },
  })

  const results: EvictionResult[] = []
  for (const { agentId } of agents) {
    results.push(await pruneAgentMemory(agentId, projectId))
  }
  return results
}
