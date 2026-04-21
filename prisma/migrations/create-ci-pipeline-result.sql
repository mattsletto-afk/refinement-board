CREATE TABLE IF NOT EXISTS "CIPipelineResult" (
  "id"                    TEXT NOT NULL PRIMARY KEY,
  "prNumber"              INTEGER,
  "prTitle"               TEXT NOT NULL DEFAULT '',
  "sha"                   TEXT NOT NULL DEFAULT '',
  "branch"                TEXT NOT NULL,
  "repositoryFullName"    TEXT NOT NULL DEFAULT '',
  "overallStatus"         TEXT NOT NULL,
  "lintStatus"            TEXT,
  "typecheckStatus"       TEXT,
  "unitTestStatus"        TEXT,
  "integrationTestStatus" TEXT,
  "storyId"               TEXT,
  "receivedAt"            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
