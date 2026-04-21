export type ChangeClassification = 'SAFE' | 'UNSAFE';

export type ChangeStatus = 'pending_approval' | 'approved' | 'rejected' | 'applied';

export type ChangeType =
  | 'schema_migration'
  | 'agent_logic_edit'
  | 'config_update'
  | 'documentation'
  | 'test_update'
  | 'ui_update'
  | 'dependency_update'
  | 'unknown';

export interface ProposedChange {
  id: string;
  changeType: ChangeType;
  filePath: string;
  description: string;
  diff: string;
  agentRunId?: string;
  storyId?: string;
  createdAt: Date;
  status: ChangeStatus;
  classification: ChangeClassification;
  reviewedAt?: Date;
  reviewedBy?: string;
  rejectionReason?: string;
}

export interface ClassificationResult {
  classification: ChangeClassification;
  changeType: ChangeType;
  reason: string;
}

export interface ApprovalDecision {
  approved: boolean;
  reviewedBy: string;
  rejectionReason?: string;
}
