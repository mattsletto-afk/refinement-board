# Operational Handoff — Coordinator Agent Implementation

**Version:** 1.0  
**Owner:** Agent Execution Engine team  
**Last Updated:** 2024-01-01  

---

## Overview

The Coordinator Agent runs first in every simulation run. It:
1. Collects all board items (epics, features, stories) from the DB
2. Calls the LLM (Claude) to produce an execution plan
3. Assigns non-overlapping items to specialist agents
4. Detects and queues conflicting write requests
5. Acquires row-level locks in the `AgentLock` table
6. Produces `HandoffContext` objects for each downstream agent

---

## How to Restart a Stalled Coordinator

A coordinator is considered **stalled** when:
- A simulation run has status `pending` or `active` for > 10 minutes
- The `AgentLock` table contains entries for that `runId` but no downstream agents have progressed

### Steps to restart:

1. **Identify the stalled run:**
   ```sql
   SELECT id, simulationId, status, createdAt
   FROM SimulationRun
   WHERE status IN ('pending', 'active')
   AND createdAt < datetime('now', '-10 minutes');
   ```

2. **Release all locks for that run** (see unlock procedure below).

3. **Reset run status to `pending`:**
   ```sql
   UPDATE SimulationRun SET status = 'pending' WHERE id = '<run-id>';
   ```

4. **Re-trigger via API:**
   ```bash
   curl -X POST /api/simulations/<sim-id>/run
   ```

5. Monitor logs for coordinator output. If the LLM returns malformed JSON, the coordinator falls back to an empty plan (agents run organically).

---

## How to Manually Unlock a Write-Locked Board Item

Locks are stored in the `AgentLock` table. Each lock has a composite unique key on `(runId, itemId)`.

### Find the lock:
```sql
SELECT id, runId, itemId, itemType, itemTitle, lockedByAgent, createdAt
FROM AgentLock
WHERE itemId = '<item-id>';
```

### Release via API (preferred):
```bash
# If an admin unlock endpoint exists:
POST /api/admin/agent-locks/<lock-id>/release
```

### Release via DB (emergency only):
```sql
DELETE FROM AgentLock WHERE id = '<lock-id>';
```

### Release all locks for a run:
```sql
DELETE FROM AgentLock WHERE runId = '<run-id>';
```

> ⚠️ **Warning:** Manually releasing locks while a run is active may cause duplicate writes. Only do this when the run is confirmed stalled.

---

## Escalation Path When Conflict Detection Fires

Conflicts are expected and handled automatically. However, if conflicts occur repeatedly across runs for the same item, escalate as follows:

### Level 1 — Automatic (handled by system)
- Second write is deferred to the next run
- Conflict entry logged in `ExecutionPlan.conflictQueue`
- Reason string stored for audit

### Level 2 — Developer Review
Trigger: Same item conflicts in 3+ consecutive runs

1. Check agent assignment logic — is the coordinator prompt producing consistent assignments?
2. Check if the item has an unusual state (e.g., archived, missing FK) preventing clean assignment.
3. Review `AgentLock` table for orphaned locks from crashed runs.

### Level 3 — On-Call Escalation
Trigger: Coordinator agent fails to produce any plan for 2+ consecutive runs OR all items end up in conflict queue.

1. Page on-call engineer via PagerDuty runbook (see below).
2. Check Anthropic API status for outages.
3. If LLM is unavailable, enable `COORDINATOR_BYPASS_MODE=true` env var — agents run with no assigned items (organic mode).

---

## On-Call Runbook Reference

### Runbook: `COORD-001` — Coordinator Agent Failure

**Symptoms:**
- Simulation runs stuck in `pending` state
- `AgentLock` table grows without corresponding run completions
- Application logs show `CoordinatorPlanOutput` parse failures

**Immediate Actions:**
1. Check Anthropic API connectivity: `curl https://api.anthropic.com/v1/models`
2. Check `DATABASE_URL` env var is set and DB file is accessible
3. Run: `SELECT COUNT(*) FROM AgentLock WHERE createdAt < datetime('now', '-1 hour');` — if > 100, purge stale locks
4. Restart the Next.js server process

**Recovery:**
1. Purge stale locks: `DELETE FROM AgentLock WHERE createdAt < datetime('now', '-30 minutes');`
2. Reset stuck runs: `UPDATE SimulationRun SET status = 'failed' WHERE status = 'active' AND updatedAt < datetime('now', '-30 minutes');`
3. Notify stakeholders of delayed simulation runs
4. Re-trigger runs after recovery confirmed

### Runbook: `COORD-002` — Persistent Conflict Loop

**Symptoms:**
- Same items appear in `conflictQueue` across multiple consecutive runs
- Downstream agents never process specific board items

**Immediate Actions:**
1. Identify affected items from recent `conflictQueue` logs
2. Check if locks exist for those items: `SELECT * FROM AgentLock WHERE itemId = '<id>';`
3. If stale locks exist, release them (see unlock procedure)
4. If no stale locks, the coordinator prompt may be producing non-deterministic assignments — review prompt template

**Escalation:** Contact the Agent Execution Engine team lead if unresolved after 2 hours.

---

## Environment Variables

| Variable | Purpose | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Authenticate with Claude API | Required |
| `DATABASE_URL` | SQLite DB path | Required |
| `COORDINATOR_BYPASS_MODE` | Skip LLM call, run agents organically | `false` |

---

## Architecture Notes

- Lock table: `AgentLock` (Prisma model, SQLite)
- Unique constraint: `(runId, itemId)` — prevents duplicate locks at DB level
- Lock cleanup: `releaseAllLocksForRun(runId)` called after successful run completion
- Fallback: If coordinator LLM call fails, `CoordinatorPlanOutput` defaults to empty assignments — agents proceed without explicit item assignments
- Handoff context: Serialized as JSON, passed to each agent before its turn
