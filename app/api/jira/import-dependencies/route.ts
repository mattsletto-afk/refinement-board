import { NextRequest, NextResponse } from 'next/server';
import { importDependencies } from '@/src/domain/jira/dependencyImporterV2';
import type { JiraIssueLink, JiraIssueLinkType } from '@/src/domain/jira/types';

interface ImportRequestBody {
  issueLinks: JiraIssueLink[];
  issueLinkTypes: JiraIssueLinkType[];
  issueKeyToId: Record<string, string>;
}

function validateBody(body: unknown): body is ImportRequestBody {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b['issueLinks'])) return false;
  if (!Array.isArray(b['issueLinkTypes'])) return false;
  if (!b['issueKeyToId'] || typeof b['issueKeyToId'] !== 'object') return false;
  return true;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!validateBody(body)) {
    return NextResponse.json(
      { error: 'Missing required fields: issueLinks, issueLinkTypes, issueKeyToId' },
      { status: 400 },
    );
  }

  const issueKeyToId = new Map(Object.entries(body.issueKeyToId));

  const result = await importDependencies(
    body.issueLinks,
    body.issueLinkTypes,
    issueKeyToId,
  );

  return NextResponse.json({
    imported: result.imported,
    skipped: result.skipped,
    total: result.dependencies.length,
  });
}
