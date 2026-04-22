import { NextResponse } from 'next/server'
import { listSimJobs } from '@/src/infrastructure/db/simJobs'
import type { SimJobStatus } from '@/src/infrastructure/db/simJobs'

/**
 * GET /api/jobs/queue
 * Job queue dashboard — returns all jobs, optionally filtered by status.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url)
  const status = url.searchParams.get('status') as SimJobStatus | null
  const limit = Math.min(200, parseInt(url.searchParams.get('limit') ?? '50', 10))

  const jobs = await listSimJobs({ status: status ?? undefined, limit })

  const counts = jobs.reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1
    return acc
  }, {})

  return NextResponse.json({ jobs, counts, total: jobs.length })
}
