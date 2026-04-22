import { NextResponse } from 'next/server'
import { prisma } from '@/src/infrastructure/db/client'
import { appendAuditEvent } from '@/src/infrastructure/db/auditLog'

/**
 * PATCH /api/stories/:id/convert
 * Body: { targetType: 'task' | 'story' | 'feature' }
 * Converts a UserStory to another entity type.
 * For story→task: creates a Task with the same title/description.
 * Blocked if the story has child tasks.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await req.json() as { targetType?: string }

  if (!body.targetType || !['task', 'story', 'feature'].includes(body.targetType)) {
    return NextResponse.json(
      { error: 'targetType must be one of: task, story, feature' },
      { status: 400 },
    )
  }

  const story = await prisma.userStory.findUnique({ where: { id } })
  if (!story) {
    return NextResponse.json({ error: 'Story not found' }, { status: 404 })
  }

  if (body.targetType === 'task') {
    // Block if story has child tasks
    const childCount = await prisma.task.count({ where: { storyId: id } })
    if (childCount > 0) {
      return NextResponse.json(
        { error: `Cannot convert: story has ${childCount} child task(s)` },
        { status: 422 },
      )
    }

    const task = await prisma.task.create({
      data: {
        projectId:   story.projectId,
        title:       story.title,
        description: story.userStory || story.businessProblem || undefined,
        status:      'todo',
      },
    })

    await appendAuditEvent({
      projectId:   story.projectId,
      eventType:   'change.applied',
      actorType:   'user',
      actorId:     'convert',
      entityType:  'task',
      entityId:    task.id,
      entityTitle: task.title,
      details:     { action: 'story-converted-to-task', sourceStoryId: id, targetTaskId: task.id },
    })

    return NextResponse.json({ ok: true, task })
  }

  // story→feature or story→story (no-op or future: stub)
  return NextResponse.json(
    { error: `Conversion to '${body.targetType}' is not yet implemented` },
    { status: 501 },
  )
}
