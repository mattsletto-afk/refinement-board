const MAX_BRANCH_SEGMENT_LENGTH = 40
const BRANCH_PREFIX = 'agent'

export function deriveBranchName(storyId: string, storyTitle?: string): string {
  const sanitizedId = storyId.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()

  if (!storyTitle) {
    return `${BRANCH_PREFIX}/${sanitizedId}`
  }

  const sanitizedTitle = storyTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, MAX_BRANCH_SEGMENT_LENGTH)
    .replace(/-$/, '')

  return `${BRANCH_PREFIX}/${sanitizedId}/${sanitizedTitle}`
}

export function buildCommitMessage(storyId: string, storyTitle: string, agentAction: string): string {
  const shortTitle = storyTitle.slice(0, 72)
  return `feat(${storyId}): ${shortTitle}\n\n${agentAction}`
}
