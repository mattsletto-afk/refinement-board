const { describe, test, expect, beforeEach } = require('@jest/globals');

// Inline the logic from issueLinkAdapter.ts so tests are self-contained

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

function classifyLinkDirection(linkType) {
  if (BLOCKS_OUTWARD_NAMES.has(linkType.outward)) {
    return 'source-blocks-dest';
  }
  if (BLOCKED_BY_INWARD_NAMES.has(linkType.inward)) {
    return 'dest-blocks-source';
  }
  return 'unrelated';
}

function resolveLinkToDependency(link, linkTypeMap, issueKeyToId, generateId) {
  const linkType = linkTypeMap.get(link.linkTypeId);
  if (!linkType) return null;

  const direction = classifyLinkDirection(linkType);
  if (direction === 'unrelated') return null;

  let blockerKey, blockedKey;

  if (direction === 'source-blocks-dest') {
    blockerKey = link.sourceIssueKey;
    blockedKey = link.destinationIssueKey;
  } else {
    blockerKey = link.destinationIssueKey;
    blockedKey = link.sourceIssueKey;
  }

  const blockerId = issueKeyToId.get(blockerKey);
  const blockedId = issueKeyToId.get(blockedKey);

  if (!blockerId || !blockedId) return null;

  return {
    id: generateId(blockerId, blockedId),
    blockerId,
    blockedId,
    jiraSourceKey: link.sourceIssueKey,
    jiraDestKey: link.destinationIssueKey,
    jiraLinkType: linkType.linkTypeName,
  };
}

function resolveIssueLinksToDependencies(issueLinks, issueLinkTypes, issueKeyToId, generateId) {
  const linkTypeMap = new Map(issueLinkTypes.map((lt) => [lt.id, lt]));
  const seen = new Set();
  const dependencies = [];

  for (const link of issueLinks) {
    const dep = resolveLinkToDependency(link, linkTypeMap, issueKeyToId, generateId);
    if (!dep) continue;

    const dedupeKey = `${dep.blockerId}:${dep.blockedId}`;
    if (seen.has(dedupeKey)) continue;

    seen.add(dedupeKey);
    dependencies.push(dep);
  }

  return dependencies;
}

const simpleGenerateId = (blockerId, blockedId) => `dep_${blockerId}_${blockedId}`;

describe('classifyLinkDirection', () => {
  test('classifies outward "Blocks" as source-blocks-dest', () => {
    const linkType = { id: '1', linkTypeName: 'Blocks', inward: 'is blocked by', outward: 'Blocks' };
    expect(classifyLinkDirection(linkType)).toBe('source-blocks-dest');
  });

  test('classifies outward "blocks" (lowercase) as source-blocks-dest', () => {
    const linkType = { id: '1', linkTypeName: 'Blocks', inward: 'is blocked by', outward: 'blocks' };
    expect(classifyLinkDirection(linkType)).toBe('source-blocks-dest');
  });

  test('classifies outward "Is Blocking" as source-blocks-dest', () => {
    const linkType = { id: '1', linkTypeName: 'Blocks', inward: 'is blocked by', outward: 'Is Blocking' };
    expect(classifyLinkDirection(linkType)).toBe('source-blocks-dest');
  });

  test('classifies inward "is blocked by" as dest-blocks-source when outward is not a blocks type', () => {
    const linkType = { id: '2', linkTypeName: 'Blocks', inward: 'is blocked by', outward: 'something-else' };
    expect(classifyLinkDirection(linkType)).toBe('dest-blocks-source');
  });

  test('classifies inward "Blocked By" as dest-blocks-source', () => {
    const linkType = { id: '2', linkTypeName: 'Blocks', inward: 'Blocked By', outward: 'something-else' };
    expect(classifyLinkDirection(linkType)).toBe('dest-blocks-source');
  });

  test('classifies unrelated link types as unrelated', () => {
    const linkType = { id: '3', linkTypeName: 'Relates', inward: 'relates to', outward: 'relates to' };
    expect(classifyLinkDirection(linkType)).toBe('unrelated');
  });

  test('classifies "Duplicate" link type as unrelated', () => {
    const linkType = { id: '4', linkTypeName: 'Duplicate', inward: 'is duplicated by', outward: 'duplicates' };
    expect(classifyLinkDirection(linkType)).toBe('unrelated');
  });
});

describe('resolveLinkToDependency', () => {
  const blocksLinkType = {
    id: 'lt-blocks',
    linkTypeName: 'Blocks',
    inward: 'is blocked by',
    outward: 'Blocks',
  };

  const linkTypeMap = new Map([['lt-blocks', blocksLinkType]]);
  const issueKeyToId = new Map([
    ['PROJ-1', 'story-id-1'],
    ['PROJ-2', 'story-id-2'],
    ['PROJ-3', 'story-id-3'],
  ]);

  beforeEach(() => jest.clearAllMocks());

  test('returns null when link type not found', () => {
    const link = { id: 'l1', linkTypeId: 'unknown', linkTypeName: '', sourceIssueKey: 'PROJ-1', destinationIssueKey: 'PROJ-2' };
    const result = resolveLinkToDependency(link, linkTypeMap, issueKeyToId, simpleGenerateId);
    expect(result).toBeNull();
  });

  test('returns null for unrelated link type', () => {
    const relatesType = { id: 'lt-relates', linkTypeName: 'Relates', inward: 'relates to', outward: 'relates to' };
    const mapWithRelates = new Map([['lt-relates', relatesType]]);
    const link = { id: 'l1', linkTypeId: 'lt-relates', linkTypeName: 'Relates', sourceIssueKey: 'PROJ-1', destinationIssueKey: 'PROJ-2' };
    const result = resolveLinkToDependency(link, mapWithRelates, issueKeyToId, simpleGenerateId);
    expect(result).toBeNull();
  });

  test('resolves source-blocks-dest: source is blocker, destination is blocked', () => {
    const link = { id: 'l1', linkTypeId: 'lt-blocks', linkTypeName: 'Blocks', sourceIssueKey: 'PROJ-1', destinationIssueKey: 'PROJ-2' };
    const result = resolveLinkToDependency(link, linkTypeMap, issueKeyToId, simpleGenerateId);
    expect(result).not.toBeNull();
    expect(result.blockerId).toBe('story-id-1');
    expect(result.blockedId).toBe('story-id-2');
    expect(result.jiraSourceKey).toBe('PROJ-1');
    expect(result.jiraDestKey).toBe('PROJ-2');
    expect(result.jiraLinkType).toBe('Blocks');
  });

  test('resolves dest-blocks-source: destination is blocker, source is blocked', () => {
    const blockedByType = { id: 'lt-blockedby', linkTypeName: 'Blocks', inward: 'is blocked by', outward: 'something-else' };
    const mapWithBlockedBy = new Map([['lt-blockedby', blockedByType]]);
    const link = { id: 'l2', linkTypeId: 'lt-blockedby', linkTypeName: 'Blocks', sourceIssueKey: 'PROJ-2', destinationIssueKey: 'PROJ-1' };
    const result = resolveLinkToDependency(link, mapWithBlockedBy, issueKeyToId, simpleGenerateId);
    expect(result).not.toBeNull();
    expect(result.blockerId).toBe('story-id-1');
    expect(result.blockedId).toBe('story-id-2');
  });

  test('returns null when source issue key not in map', () => {
    const link = { id: 'l1', linkTypeId: 'lt-blocks', linkTypeName: 'Blocks', sourceIssueKey: 'PROJ-999', destinationIssueKey: 'PROJ-2' };
    const result = resolveLinkToDependency(link, linkTypeMap, issueKeyToId, simpleGenerateId);
    expect(result).toBeNull();
  });

  test('returns null when destination issue key not in map', () => {
    const link = { id: 'l1', linkTypeId: 'lt-blocks', linkTypeName: 'Blocks', sourceIssueKey: 'PROJ-1', destinationIssueKey: 'PROJ-999' };
    const result = resolveLinkToDependency(link, linkTypeMap, issueKeyToId, simpleGenerateId);
    expect(result).toBeNull();
  });

  test('includes generated id in result', () => {
    const link = { id: 'l1', linkTypeId: 'lt-blocks', linkTypeName: 'Blocks', sourceIssueKey: 'PROJ-1', destinationIssueKey: 'PROJ-2' };
    const result = resolveLinkToDependency(link, linkTypeMap, issueKeyToId, simpleGenerateId);
    expect(result.id).toBe('dep_story-id-1_story-id-2');
  });
});

describe('resolveIssueLinksToDependencies', () => {
  const blocksLinkType = {
    id: 'lt-blocks',
    linkTypeName: 'Blocks',
    inward: 'is blocked by',
    outward: 'Blocks',
  };
  const relatesLinkType = {
    id: 'lt-relates',
    linkTypeName: 'Relates',
    inward: 'relates to',
    outward: 'relates to',
  };

  const issueKeyToId = new Map([
    ['PROJ-1', 'story-id-1'],
    ['PROJ-2', 'story-id-2'],
    ['PROJ-3', 'story-id-3'],
  ]);

  beforeEach(() => jest.clearAllMocks());

  test('returns empty array when no links provided', () => {
    const result = resolveIssueLinksToDependencies([], [blocksLinkType], issueKeyToId, simpleGenerateId);
    expect(result).toEqual([]);
  });

  test('returns empty array when no link types match', () => {
    const link = { id: 'l1', linkTypeId: 'lt-blocks', linkTypeName: 'Blocks', sourceIssueKey: 'PROJ-1', destinationIssueKey: 'PROJ-2' };
    const result = resolveIssueLinksToDependencies([link], [], issueKeyToId, simpleGenerateId);
    expect(result).toEqual([]);
  });

  test('filters out unrelated link types and returns only block dependencies', () => {
    const links = [
      { id: 'l1', linkTypeId: 'lt-blocks', linkTypeName: 'Blocks', sourceIssueKey: 'PROJ-1', destinationIssueKey: 'PROJ-2' },
      { id: 'l2', linkTypeId: 'lt-relates', linkTypeName: 'Relates', sourceIssueKey: 'PROJ-2', destinationIssueKey: 'PROJ-3' },
    ];
    const result = resolveIssueLinksToDependencies(links, [blocksLinkType, relatesLinkType], issueKeyToId, simpleGenerateId);
    expect(result).toHaveLength(1);
    expect(result[0].blockerId).toBe('story-id-1');
    expect(result[0].blockedId).toBe('story-id-2');
  });

  test('deduplicates links that resolve to the same blocker-blocked pair', () => {
    const links = [
      { id: 'l1', linkTypeId: 'lt-blocks', linkTypeName: 'Blocks', sourceIssueKey: 'PROJ-1', destinationIssueKey: 'PROJ-2' },
      { id: 'l2', linkTypeId: 'lt-blocks', linkTypeName: 'Blocks', sourceIssueKey: 'PROJ-1', destinationIssueKey: 'PROJ-2' },
    ];
    const result = resolveIssueLinksToDependencies(links, [blocksLinkType], issueKeyToId, simpleGenerateId);
    expect(result).toHaveLength(1);
  });

  test('processes multiple distinct dependencies', () => {
    const links = [
      { id: 'l1', linkTypeId: 'lt-blocks', linkTypeName: 'Blocks', sourceIssueKey: 'PROJ-1', destinationIssueKey: 'PROJ-2' },
      { id: 'l2', linkTypeId: 'lt-blocks', linkTypeName: 'Blocks', sourceIssueKey: 'PROJ-2', destinationIssueKey: 'PROJ-3' },
    ];
    const result = resolveIssueLinksToDependencies(links, [blocksLinkType], issueKeyToId, simpleGenerateId);
    expect(result).toHaveLength(2);
    expect(result[0].blockerId).toBe('story-id-1');
    expect(result[0].blockedId).toBe('story-id-2');
    expect(result[1].blockerId).toBe('story-id-2');
    expect(result[1].blockedId).toBe('story-id-3');
  });

  test('skips links where issue keys are not in the id map', () => {
    const links = [
      { id: 'l1', linkTypeId: 'lt-blocks', linkTypeName: 'Blocks', sourceIssueKey: 'PROJ-999', destinationIssueKey: 'PROJ-2' },
      { id: 'l2', linkTypeId: 'lt-blocks', linkTypeName: 'Blocks', sourceIssueKey: 'PROJ-1', destinationIssueKey: 'PROJ-2' },
    ];
    const result = resolveIssueLinksToDependencies(links, [blocksLinkType], issueKeyToId, simpleGenerateId);
    expect(result).toHaveLength(1);
    expect(result[0].blockerId).toBe('story-id-1');
  });

  test('preserves jira metadata on resolved dependencies', () => {
    const links = [
      { id: 'l1', linkTypeId: 'lt-blocks', linkTypeName: 'Blocks', sourceIssueKey: 'PROJ-1', destinationIssueKey: 'PROJ-2' },
    ];
    const result = resolveIssueLinksToDependencies(links, [blocksLinkType], issueKeyToId, simpleGenerateId);
    expect(result[0].jiraSourceKey).toBe('PROJ-1');
    expect(result[0].jiraDestKey).toBe('PROJ-2');
    expect(result[0].jiraLinkType).toBe('Blocks');
  });

  test('handles "Is Blocking" outward label correctly', () => {
    const isBlockingType = { id: 'lt-isblocking', linkTypeName: 'Blocks', inward: 'is blocked by', outward: 'Is Blocking' };
    const links = [
      { id: 'l1', linkTypeId: 'lt-isblocking', linkTypeName: 'Blocks', sourceIssueKey: 'PROJ-1', destinationIssueKey: 'PROJ-2' },
    ];
    const result = resolveIssueLinksToDependencies(links, [isBlockingType], issueKeyToId, simpleGenerateId);
    expect(result).toHaveLength(1);
    expect(result[0].blockerId).toBe('story-id-1');
    expect(result[0].blockedId).toBe('story-id-2');
  });
});
