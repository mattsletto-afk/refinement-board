import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { prisma } from '@/src/infrastructure/db/client'

/**
 * POST /api/github/webhook
 * Handles GitHub pull_request webhook events.
 * Validates X-Hub-Signature-256 header.
 * On PR merge: finds the associated UserStory via StoryFileMap branch and sets status→'done'.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret) {
    console.warn('GITHUB_WEBHOOK_SECRET not configured — skipping signature validation')
  }

  const rawBody = await req.text()

  // Validate signature
  if (secret) {
    const sigHeader = req.headers.get('x-hub-signature-256')
    if (!sigHeader) {
      return NextResponse.json({ error: 'Missing X-Hub-Signature-256' }, { status: 401 })
    }
    const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
    try {
      const sigBuf = Buffer.from(sigHeader)
      const expBuf = Buffer.from(expected)
      if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    } catch {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  const event = req.headers.get('x-github-event')
  if (event !== 'pull_request') {
    return NextResponse.json({ ok: true, skipped: true, reason: 'not a pull_request event' })
  }

  let payload: {
    action: string
    pull_request: { head: { ref: string }; merged: boolean; html_url: string }
  }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  const { action, pull_request: pr } = payload

  if (!['opened', 'closed', 'merged'].includes(action)) {
    return NextResponse.json({ ok: true, skipped: true, reason: `action '${action}' not handled` })
  }

  // On merge: find stories linked to this branch via StoryFileMap
  const isMerged = action === 'closed' && pr.merged === true
  if (isMerged) {
    const branch = pr.head.ref

    // Find StoryFileMap records that contain the branch name in relativePath
    // (branch is stored as part of the file path or a separate field depending on implementation)
    // We search for stories whose mapped files originated from this branch
    const fileMaps = await (prisma as unknown as {
      storyFileMap: { findMany: (args: object) => Promise<Array<{ storyId: string; projectId: string }>> }
    }).storyFileMap.findMany({
      where: {
        relativePath: { contains: branch },
      },
      select: { storyId: true, projectId: true },
    })

    const storyIds = [...new Set(fileMaps.map((f) => f.storyId))]

    if (storyIds.length > 0) {
      await prisma.userStory.updateMany({
        where: { id: { in: storyIds } },
        data:  { status: 'done' },
      })
    }

    return NextResponse.json({ ok: true, action: 'merged', branch, storiesUpdated: storyIds })
  }

  return NextResponse.json({ ok: true, action, branch: pr.head.ref })
}
