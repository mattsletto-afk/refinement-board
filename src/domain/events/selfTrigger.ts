/**
 * Self-Trigger Service (Rank 64)
 * After a successful write→test→commit cycle, emits a run.completed event
 * and enqueues a codegen.next-story event to continue the autonomous loop.
 *
 * This closes the feedback loop: commit success → select next story → run again.
 */

import { enqueueEvent } from '@/src/infrastructure/db/triggerEvents'
import { selectNextStory } from '@/src/domain/storySelector/service'
import { appendAuditEvent } from '@/src/infrastructure/db/auditLog'
import { stopLoopSession } from '@/src/domain/loop/loopSession'
import type { CommitResult } from '@/src/infrastructure/git/agentCommit'

export interface SelfTriggerInput {
  projectId:   string
  runId:       string
  storyId:     string
  storyTitle:  string
  commitResult: CommitResult
  autoApplied?: number
  manualReview?: number
}

export interface SelfTriggerResult {
  runCompletedEventId: string | null
  nextStoryEventId:    string | null
  nextStory:           { id: string; rank: number; title: string } | null
  loopContinues:       boolean
}

/**
 * Called after a successful commit.
 * Emits run.completed + codegen.next-story events so the job processor
 * continues the autonomous loop without human intervention.
 */
export async function triggerNextCycle(input: SelfTriggerInput): Promise<SelfTriggerResult> {
  let runCompletedEventId: string | null = null
  let nextStoryEventId: string | null = null

  // 1. Emit run.completed into the trigger queue
  try {
    const evt = await enqueueEvent({
      type: 'run.completed',
      payload: {
        projectId:   input.projectId,
        runId:       input.runId,
        storyId:     input.storyId,
        commitSha:   input.commitResult.commitSha,
        branch:      input.commitResult.branch,
        autoApplied: input.autoApplied ?? 0,
        manualReview: input.manualReview ?? 0,
      },
    })
    runCompletedEventId = evt?.id ?? null
  } catch { /* non-fatal */ }

  // 2. Find the next story to work on
  const selection = await selectNextStory(input.projectId).catch(() => null)
  const nextStory = selection?.story ?? null

  // 3. If there's a next story, enqueue the codegen job
  if (nextStory) {
    try {
      const evt = await enqueueEvent({
        type: 'codegen.next-story',
        payload: {
          projectId: input.projectId,
          storyId:   nextStory.id,
          storyRank: nextStory.rank,
          title:     nextStory.title,
        },
      })
      nextStoryEventId = evt?.id ?? null
    } catch { /* non-fatal */ }
  }

  // 4. If no next story found, stop the running loop session
  if (!nextStory) {
    stopLoopSession(input.projectId, 'no-stories').catch(() => {})
  }

  // 5. Audit the loop continuation
  appendAuditEvent({
    projectId:   input.projectId,
    runId:       input.runId,
    eventType:   'run.completed',
    actorType:   'system',
    actorId:     'self-trigger',
    entityType:  'story',
    entityTitle: input.storyTitle,
    details: {
      commitSha:        input.commitResult.commitSha,
      nextStoryId:      nextStory?.id ?? null,
      nextStoryTitle:   nextStory?.title ?? null,
      loopContinues:    !!nextStory,
    },
  }).catch(() => {})

  return {
    runCompletedEventId,
    nextStoryEventId,
    nextStory,
    loopContinues: !!nextStory,
  }
}
