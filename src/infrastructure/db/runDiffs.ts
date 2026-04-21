import { prisma } from './client'
import type { ProjectStateSnapshot, DiffSummary, RunDiffRecord } from '@/src/domain/diff'

export interface CreateRunDiffInput {
  agentRunId:  string
  projectId:   string
  beforeState: ProjectStateSnapshot
  afterState:  ProjectStateSnapshot
  diffSummary: DiffSummary
}

export async function saveRunDiff(input: CreateRunDiffInput): Promise<RunDiffRecord> {
  const humanSummary = input.diffSummary.humanLines.join('\n')
  const row = await prisma.runDiff.create({
    data: {
      agentRunId:  input.agentRunId,
      projectId:   input.projectId,
      beforeState: JSON.stringify(input.beforeState),
      afterState:  JSON.stringify(input.afterState),
      diffSummary: JSON.stringify(input.diffSummary),
      humanSummary,
    },
  })
  return toRecord(row)
}

export async function getRunDiff(agentRunId: string): Promise<RunDiffRecord | null> {
  const row = await prisma.runDiff.findUnique({ where: { agentRunId } })
  return row ? toRecord(row) : null
}

export async function getRunDiffsByProject(projectId: string): Promise<RunDiffRecord[]> {
  const rows = await prisma.runDiff.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(toRecord)
}

function toRecord(row: {
  id: string; agentRunId: string; projectId: string
  beforeState: string; afterState: string; diffSummary: string
  humanSummary: string; createdAt: Date
}): RunDiffRecord {
  return {
    id:           row.id,
    agentRunId:   row.agentRunId,
    projectId:    row.projectId,
    beforeState:  JSON.parse(row.beforeState) as ProjectStateSnapshot,
    afterState:   JSON.parse(row.afterState)  as ProjectStateSnapshot,
    diffSummary:  JSON.parse(row.diffSummary) as DiffSummary,
    humanSummary: row.humanSummary,
    createdAt:    row.createdAt.toISOString(),
  }
}
