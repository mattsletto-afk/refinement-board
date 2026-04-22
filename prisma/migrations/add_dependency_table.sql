CREATE TABLE IF NOT EXISTS "Dependency" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "blockerId"      TEXT NOT NULL,
  "blockedId"      TEXT NOT NULL,
  "jiraSourceKey"  TEXT,
  "jiraDestKey"    TEXT,
  "jiraLinkType"   TEXT,
  "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("blockerId", "blockedId")
);
