import { NextResponse } from 'next/server'
import { prisma } from '@/src/infrastructure/db/client'

/**
 * GET /api/projects/:id/health
 * Returns loop health metrics for the last 7 days:
 *   - run success/failure counts and rate
 *   - avg duration per run
 *   - token spend per day
 *   - recent errors with messages
 *   - alert flags (runaway run, high failure rate, spend spike)
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: projectId } = await params

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const runs = await prisma.agentRun.findMany({
    where: { projectId, createdAt: { gte: since } },
    select: {
      id: true,
      status: true,
      summary: true,
      tokensUsed: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  const total = runs.length
  const completed = runs.filter(r => r.status === 'complete').length
  const failed = runs.filter(r => r.status === 'failed').length
  const running = runs.filter(r => r.status === 'running').length
  const successRate = total > 0 ? Math.round((completed / (completed + failed)) * 100) : null

  // Average duration for completed runs
  const durations = runs
    .filter(r => r.status === 'complete' && r.startedAt && r.completedAt)
    .map(r => (new Date(r.completedAt!).getTime() - new Date(r.startedAt!).getTime()) / 1000)
  const avgDurationSec = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null

  // Token spend bucketed by day
  const spendByDay: Record<string, number> = {}
  for (const run of runs) {
    const day = run.createdAt.toISOString().slice(0, 10)
    spendByDay[day] = (spendByDay[day] ?? 0) + (run.tokensUsed ?? 0)
  }

  // Stale running runs (started > 15 minutes ago)
  const now = Date.now()
  const staleRuns = runs.filter(r =>
    r.status === 'running' &&
    r.startedAt &&
    now - new Date(r.startedAt).getTime() > 15 * 60 * 1000
  )

  // Recent failures with summaries
  const recentErrors = runs
    .filter(r => r.status === 'failed')
    .slice(0, 5)
    .map(r => ({
      id: r.id,
      summary: r.summary ?? '(no summary)',
      at: r.createdAt.toISOString(),
    }))

  // Alerts
  const alerts: { level: 'warn' | 'error'; message: string }[] = []

  if (staleRuns.length > 0) {
    alerts.push({ level: 'error', message: `${staleRuns.length} run(s) stuck — running > 15 minutes` })
  }
  if (successRate !== null && successRate < 50 && (completed + failed) >= 3) {
    alerts.push({ level: 'warn', message: `Low success rate: ${successRate}% over last 7 days` })
  }
  // Spend spike: any single day > 5 USD equivalent (rough: 1M tokens ≈ $5)
  for (const [day, tokens] of Object.entries(spendByDay)) {
    if (tokens > 1_000_000) {
      alerts.push({ level: 'warn', message: `High token usage on ${day}: ${(tokens / 1000).toFixed(0)}k tokens` })
    }
  }

  return NextResponse.json({
    projectId,
    window: '7d',
    runs: { total, completed, failed, running },
    successRate,
    avgDurationSec,
    spendByDay,
    staleRuns: staleRuns.map(r => ({ id: r.id, startedAt: r.startedAt })),
    recentErrors,
    alerts,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
