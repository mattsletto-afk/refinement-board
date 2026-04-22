import { prisma } from '@/src/infrastructure/db/client';
import type { ChangeStatus, ChangeClassification, ChangeType, ProposedChange } from '@/src/domain/changeClassification/types';

function mapToProposedChange(record: {
  id: string;
  changeType: string;
  filePath: string;
  description: string;
  diff: string;
  agentRunId: string | null;
  storyId: string | null;
  createdAt: Date;
  status: string;
  classification: string;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
}): ProposedChange {
  return {
    id: record.id,
    changeType: record.changeType as ChangeType,
    filePath: record.filePath,
    description: record.description,
    diff: record.diff,
    agentRunId: record.agentRunId ?? undefined,
    storyId: record.storyId ?? undefined,
    createdAt: record.createdAt,
    status: record.status as ChangeStatus,
    classification: record.classification as ChangeClassification,
    reviewedAt: record.reviewedAt ?? undefined,
    reviewedBy: record.reviewedBy ?? undefined,
    rejectionReason: record.rejectionReason ?? undefined,
  };
}

export async function createProposedChange(data: {
  changeType: ChangeType;
  filePath: string;
  description: string;
  diff: string;
  agentRunId?: string;
  storyId?: string;
  status: ChangeStatus;
  classification: ChangeClassification;
}): Promise<ProposedChange> {
  const record = await prisma.proposedChange.create({
    data: {
      changeType: data.changeType,
      filePath: data.filePath,
      description: data.description,
      diff: data.diff,
      agentRunId: data.agentRunId ?? null,
      storyId: data.storyId ?? null,
      status: data.status,
      classification: data.classification,
    },
  });
  return mapToProposedChange(record);
}

export async function getProposedChangeById(id: string): Promise<ProposedChange | null> {
  const record = await prisma.proposedChange.findUnique({ where: { id } });
  if (!record) return null;
  return mapToProposedChange(record);
}

export async function listProposedChanges(filter?: {
  status?: ChangeStatus;
  classification?: ChangeClassification;
}): Promise<ProposedChange[]> {
  const records = await prisma.proposedChange.findMany({
    where: {
      status: filter?.status,
      classification: filter?.classification,
    },
    orderBy: { createdAt: 'desc' },
  });
  return records.map(mapToProposedChange);
}

export async function updateProposedChangeStatus(
  id: string,
  status: ChangeStatus,
  reviewData?: {
    reviewedBy: string;
    rejectionReason?: string;
  },
): Promise<ProposedChange> {
  const record = await prisma.proposedChange.update({
    where: { id },
    data: {
      status,
      reviewedAt: reviewData ? new Date() : undefined,
      reviewedBy: reviewData?.reviewedBy ?? null,
      rejectionReason: reviewData?.rejectionReason ?? null,
    },
  });
  return mapToProposedChange(record);
}
