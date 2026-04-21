-- CreateTable
CREATE TABLE IF NOT EXISTS "AgentLock" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    "runId" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemTitle" TEXT NOT NULL,
    "lockedByAgent" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AgentLock_runId_itemId_key" ON "AgentLock"("runId", "itemId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AgentLock_runId_idx" ON "AgentLock"("runId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AgentLock_simulationId_idx" ON "AgentLock"("simulationId");
