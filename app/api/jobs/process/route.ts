import { NextResponse } from 'next/server'
import { dequeueSimJobs, claimSimJob, markSimJobComplete, markSimJobFailed } from '@/src/infrastructure/db/simJobs'
import { executeSimulationJob } from '@/src/domain/events/simJobRunner'

/**
 * POST /api/jobs/process
 * Drains the simulation job queue — intended to be called by a cron trigger every ~30s.
 * Processes up to `limit` jobs per invocation (default 3).
 */
export async function POST(req: Request): Promise<NextResponse> {
  const url = new URL(req.url)
  const limit = Math.min(10, parseInt(url.searchParams.get('limit') ?? '3', 10))

  const jobs = await dequeueSimJobs(limit)
  const processed: string[] = []
  const failed: string[] = []
  const skipped: string[] = []

  for (const job of jobs) {
    const claimed = await claimSimJob(job.id)
    if (!claimed) { skipped.push(job.id); continue }

    try {
      const result = await executeSimulationJob(job.simulationId)
      await markSimJobComplete(job.id, JSON.stringify(result))
      processed.push(job.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await markSimJobFailed(job.id, msg)
      failed.push(job.id)
    }
  }

  return NextResponse.json({ processed, failed, skipped })
}
