-- CreateTable
CREATE TABLE "AgentMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "actionsJSON" TEXT NOT NULL,
    "scorecard" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AgentMemory_agentId_createdAt_idx" ON "AgentMemory"("agentId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "AgentMemory_runId_key" ON "AgentMemory"("runId");
