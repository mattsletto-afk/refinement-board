import { upsertDependency } from '@/src/infrastructure/db/dependencyRepository';
import { resolveIssueLinksToDependencies } from './issueLinkAdapter';
import type { JiraIssueLink, JiraIssueLinkType, Dependency } from './types';

function generateDependencyId(blockerId: string, blockedId: string): string {
  const combined = `${blockerId}:${blockedId}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  const absHash = Math.abs(hash).toString(36).padStart(8, '0');
  return `dep_${absHash}_${blockerId.slice(0, 8)}_${blockedId.slice(0, 8)}`;
}

export interface DependencyImportResult {
  imported: number;
  skipped: number;
  dependencies: Dependency[];
}

export async function importDependencies(
  issueLinks: JiraIssueLink[],
  issueLinkTypes: JiraIssueLinkType[],
  issueKeyToId: Map<string, string>,
): Promise<DependencyImportResult> {
  const resolved = resolveIssueLinksToDependencies(
    issueLinks,
    issueLinkTypes,
    issueKeyToId,
    generateDependencyId,
  );

  let imported = 0;
  let skipped = 0;

  for (const dep of resolved) {
    const { created } = await upsertDependency(dep);
    if (created) {
      imported++;
    } else {
      skipped++;
    }
  }

  return { imported, skipped, dependencies: resolved };
}
