import type { JiraIssueLink, JiraIssueLinkType, Dependency } from './types';

const BLOCKS_OUTWARD_NAMES = new Set([
  'blocks',
  'Blocks',
  'is blocking',
  'Is Blocking',
]);

const BLOCKED_BY_INWARD_NAMES = new Set([
  'is blocked by',
  'Is Blocked By',
  'blocked by',
  'Blocked By',
]);

function isBlocksRelationship(
  linkType: JiraIssueLinkType,
  outward: boolean,
): boolean {
  if (outward) {
    return BLOCKS_OUTWARD_NAMES.has(linkType.outward);
  }
  return BLOCKED_BY_INWARD_NAMES.has(linkType.inward);
}

export function classifyLinkDirection(
  linkType: JiraIssueLinkType,
): 'source-blocks-dest' | 'dest-blocks-source' | 'unrelated' {
  if (BLOCKS_OUTWARD_NAMES.has(linkType.outward)) {
    return 'source-blocks-dest';
  }
  if (BLOCKED_BY_INWARD_NAMES.has(linkType.inward)) {
    return 'dest-blocks-source';
  }
  return 'unrelated';
}

export function resolveLinkToDependency(
  link: JiraIssueLink,
  linkTypeMap: Map<string, JiraIssueLinkType>,
  issueKeyToId: Map<string, string>,
  generateId: (source: string, dest: string) => string,
): Dependency | null {
  const linkType = linkTypeMap.get(link.linkTypeId);
  if (!linkType) {
    return null;
  }

  const direction = classifyLinkDirection(linkType);
  if (direction === 'unrelated') {
    return null;
  }

  let blockerKey: string;
  let blockedKey: string;

  if (direction === 'source-blocks-dest') {
    blockerKey = link.sourceIssueKey;
    blockedKey = link.destinationIssueKey;
  } else {
    blockerKey = link.destinationIssueKey;
    blockedKey = link.sourceIssueKey;
  }

  const blockerId = issueKeyToId.get(blockerKey);
  const blockedId = issueKeyToId.get(blockedKey);

  if (!blockerId || !blockedId) {
    return null;
  }

  return {
    id: generateId(blockerId, blockedId),
    blockerId,
    blockedId,
    jiraSourceKey: link.sourceIssueKey,
    jiraDestKey: link.destinationIssueKey,
    jiraLinkType: linkType.linkTypeName,
  };
}

export function resolveIssueLinksToDependencies(
  issueLinks: JiraIssueLink[],
  issueLinkTypes: JiraIssueLinkType[],
  issueKeyToId: Map<string, string>,
  generateId: (source: string, dest: string) => string,
): Dependency[] {
  const linkTypeMap = new Map(
    issueLinkTypes.map((lt) => [lt.id, lt]),
  );

  const seen = new Set<string>();
  const dependencies: Dependency[] = [];

  for (const link of issueLinks) {
    const dep = resolveLinkToDependency(
      link,
      linkTypeMap,
      issueKeyToId,
      generateId,
    );

    if (!dep) {
      continue;
    }

    const dedupeKey = `${dep.blockerId}:${dep.blockedId}`;
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    dependencies.push(dep);
  }

  return dependencies;
}
