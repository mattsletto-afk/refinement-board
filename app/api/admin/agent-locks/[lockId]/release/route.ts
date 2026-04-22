/**
 * Admin API: Manually release an agent lock.
 * Used by on-call engineers to unblock stalled simulation runs.
 */
import { NextResponse } from 'next/server'
import { releaseLock, getLockForItem } from '@/src/infrastructure/db/agentLocks'
import { prisma } from '@/src/infrastructure/db/client'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ lockId: string }> },
) {
  const { lockId } = await params

  try {
    // Verify lock exists before deleting
    const existing = await prisma.agentLock.findUnique({ where: { id: lockId } })
    if (!existing) {
      return NextResponse.json({ error: 'Lock not found' }, { status: 404 })
    }

    await releaseLock(lockId)

    return NextResponse.json({
      success: true,
      message: `Lock ${lockId} released successfully`,
      releasedItem: {
        itemId: existing.itemId,
        itemType: existing.itemType,
        itemTitle: existing.itemTitle,
        lockedByAgent: existing.lockedByAgent,
        runId: existing.runId,
      },
    })
  } catch (err) {
    console.error('[AgentLock Release]', err)
    return NextResponse.json({ error: 'Failed to release lock' }, { status: 500 })
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ lockId: string }> },
) {
  const { lockId } = await params

  try {
    const lock = await prisma.agentLock.findUnique({ where: { id: lockId } })
    if (!lock) {
      return NextResponse.json({ error: 'Lock not found' }, { status: 404 })
    }
    return NextResponse.json({ lock })
  } catch (err) {
    console.error('[AgentLock GET]', err)
    return NextResponse.json({ error: 'Failed to fetch lock' }, { status: 500 })
  }
}
