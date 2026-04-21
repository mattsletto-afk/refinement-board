import { prisma } from '@/src/infrastructure/db/client'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any
import type { CIPipelineResultPayload, CIPipelineResultRecord } from './types'

export async function recordPipelineResult(
  payload: CIPipelineResultPayload
): Promise<CIPipelineResultRecord> {
  const record = await db.cIPipelineResult.create({
    data: {
      prNumber: payload.prNumber,
      prTitle: payload.prTitle,
      sha: payload.sha,
      branch: payload.branch,
      repositoryFullName: payload.repositoryFullName,
      overallStatus: payload.overallStatus,
      lintStatus: payload.jobResults.lint,
      typecheckStatus: payload.jobResults.typecheck,
      unitTestStatus: payload.jobResults.unitTests,
      integrationTestStatus: payload.jobResults.integrationTests,
      storyId: payload.storyId ?? null,
    },
  })
  return record
}

export async function getLatestPipelineResultForBranch(
  branch: string
): Promise<CIPipelineResultRecord | null> {
  return db.cIPipelineResult.findFirst({
    where: { branch },
    orderBy: { receivedAt: 'desc' },
  })
}

export async function getPipelineResultsForStory(
  storyId: string
): Promise<CIPipelineResultRecord[]> {
  return db.cIPipelineResult.findMany({
    where: { storyId },
    orderBy: { receivedAt: 'desc' },
  })
}

export async function listRecentPipelineResults(
  limit = 20
): Promise<CIPipelineResultRecord[]> {
  return db.cIPipelineResult.findMany({
    orderBy: { receivedAt: 'desc' },
    take: limit,
  })
}
