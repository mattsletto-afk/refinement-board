CREATE TABLE IF NOT EXISTS "ChangeApprovalQueue" (
  "id"                    TEXT NOT NULL PRIMARY KEY,
  "changeId"              TEXT NOT NULL,
  "agentId"               TEXT NOT NULL,
  "runId"                 TEXT,
  "changeType"            TEXT NOT NULL,
  "description"           TEXT NOT NULL DEFAULT '',
  "payload"               TEXT NOT NULL DEFAULT '{}',
  "classification"        TEXT NOT NULL,
  "classificationReason"  TEXT NOT NULL DEFAULT '',
  "status"                TEXT NOT NULL DEFAULT 'pending',
  "reviewerId"            TEXT,
  "reviewedAt"            DATETIME,
  "rejectionReason"       TEXT,
  "createdAt"             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
