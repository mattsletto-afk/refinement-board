import { classifyChange } from './classifier';
import {
  createProposedChange,
  getProposedChangeById,
  updateProposedChangeStatus,
  listProposedChanges,
} from '@/src/infrastructure/db/proposedChangeRepository';
import type {
  ProposedChange,
  ApprovalDecision,
  ClassificationResult,
} from './types';

export interface SubmitChangeInput {
  filePath: string;
  description: string;
  diff: string;
  agentRunId?: string;
  storyId?: string;
}

export interface SubmitChangeResult {
  proposedChange: ProposedChange;
  classification: ClassificationResult;
  appliedImmediately: boolean;
}

export async function submitProposedChange(
  input: SubmitChangeInput,
): Promise<SubmitChangeResult> {
  const classification = classifyChange(input.filePath, input.description);

  const status = classification.classification === 'SAFE' ? 'applied' : 'pending_approval';

  const proposedChange = await createProposedChange({
    changeType: classification.changeType,
    filePath: input.filePath,
    description: input.description,
    diff: input.diff,
    agentRunId: input.agentRunId,
    storyId: input.storyId,
    status,
    classification: classification.classification,
  });

  return {
    proposedChange,
    classification,
    appliedImmediately: classification.classification === 'SAFE',
  };
}

export async function approveChange(
  changeId: string,
  decision: ApprovalDecision,
): Promise<ProposedChange> {
  const existing = await getProposedChangeById(changeId);

  if (!existing) {
    throw new Error(`Proposed change ${changeId} not found`);
  }

  if (existing.status !== 'pending_approval') {
    throw new Error(
      `Change ${changeId} is not pending approval (current status: ${existing.status})`,
    );
  }

  const newStatus = decision.approved ? 'approved' : 'rejected';

  return updateProposedChangeStatus(changeId, newStatus, {
    reviewedBy: decision.reviewedBy,
    rejectionReason: decision.rejectionReason,
  });
}

export async function getPendingChanges(): Promise<ProposedChange[]> {
  return listProposedChanges({ status: 'pending_approval' });
}

export async function getAllChanges(
  status?: ProposedChange['status'],
): Promise<ProposedChange[]> {
  return listProposedChanges({ status });
}
