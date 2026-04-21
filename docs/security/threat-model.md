# Security Review — Threat Model & Dependency Audit

**Date:** 2026-04-19
**Scope:** Refinement Board v2 — multi-agent simulation platform
**Status:** Initial review

---

## 1. Trust Boundaries

```
Browser ──HTTPS──▶ Next.js API Routes ──▶ SQLite (local)
                        │
                        ├──▶ Anthropic API (external)
                        │
                        └──▶ Docker Sandbox (isolated subprocess)
```

| Boundary | Trust Level | Controls |
|---|---|---|
| Browser → API | Untrusted | Input validation, CSRF (same-origin), RBAC |
| API → Anthropic | External | API key in env, rate limit queue, cost guardrail |
| API → Docker Sandbox | Partially trusted | seccomp profile, no-network, read-only FS, resource limits |
| API → SQLite | Internal | Prisma ORM (parameterized queries only) |

---

## 2. Threat Matrix (STRIDE)

### S — Spoofing
| Threat | Likelihood | Impact | Control |
|---|---|---|---|
| Agent impersonation via runId forgery | Low | High | runId validated against AgentRun table; agent writes rejected if run not found |
| Prompt injection via project brief | Medium | Medium | BLOCK-005 rule (classificationEngine) rejects script-like content; sandbox isolation |

### T — Tampering
| Threat | Likelihood | Impact | Control |
|---|---|---|---|
| Suggestion payload manipulation | Medium | Medium | validatePayload() schema check; safety classification gate |
| Audit log tampering | Low | High | SHA-256 hash chain (prevHash); verifyAuditChain() detects breaks |
| SQLite file direct-write on host | Low | Critical | Database runs on host FS — production should use read-only mounts |

### R — Repudiation
| Threat | Likelihood | Impact | Control |
|---|---|---|---|
| Agent denies making a change | Low | Medium | Audit log records actor, runId, timestamp, and chained hash |
| Approval decision disputed | Low | Medium | ApprovalGate persists decider + timestamp; audit entry emitted on decide |

### I — Information Disclosure
| Threat | Likelihood | Impact | Control |
|---|---|---|---|
| ANTHROPIC_API_KEY leakage via logs | Medium | High | Key stored in env only; never logged; `.env` in `.gitignore` |
| Project data via misconfigured API | Low | High | All `/api/projects/[id]/*` routes should validate caller owns project (RBAC pending auth integration) |
| Sandbox stdout exfiltration | Low | Medium | Network disabled (`--network none`); stdout captured, not forwarded externally |

### D — Denial of Service
| Threat | Likelihood | Impact | Control |
|---|---|---|---|
| Anthropic API flooding | Medium | High | Rate limit queue (MAX_CONCURRENT=3); cost guardrail ($10 hard limit/project) |
| Docker sandbox fork bomb | Low | High | `--pids-limit 64` enforced |
| Runaway simulation loop | Medium | Medium | 30s timeout on sandbox; job queue limits concurrent jobs |

### E — Elevation of Privilege
| Threat | Likelihood | Impact | Control |
|---|---|---|---|
| Sandbox escape to host | Low | Critical | ADR-001/002: seccomp profile, cap_drop=ALL, no-new-privileges, rootless user |
| Agent achieving admin-level auto-apply | Low | High | RBAC: agents cannot auto-apply; contributor/agent role blocked by `canAutoApply()` |
| BLOCK rule bypass via payload crafting | Low | Medium | Safety engine applies rules server-side; not client-controllable |

---

## 3. Dependency Audit

### High-Risk Dependencies

| Package | Version | Risk | Notes |
|---|---|---|---|
| `@anthropic-ai/sdk` | latest | Moderate | External API; pin to specific major version in prod |
| `better-sqlite3` | latest | Low | Native addon; audit before containerization |
| `next` | 16.x | Low | Keep patched; watch for CVEs on routing |

### Audit Commands

```bash
# Run npm audit
npm audit --audit-level=moderate

# Check for known CVEs in lock file
npx better-npm-audit check

# SBOM generation (for compliance)
npx @cyclonedx/cyclonedx-npm --output-format json --output-file sbom.json
```

---

## 4. Penetration Test Scope

### In-scope endpoints

- `POST /api/projects/[id]/simulations/[sid]/run` — primary attack surface (untrusted input → LLM → DB writes)
- `PATCH /api/suggestions/[sugid]` — status transitions
- `POST /api/suggestions/auto-apply` — bulk apply
- `GET /api/projects/[id]/audit-log` — data exposure
- `POST /api/agent-memory/:agentId` — memory poisoning vector

### Test cases

1. **Prompt injection**: Submit briefing text containing `<script>`, `javascript:`, `__proto__`, `constructor[` patterns → should be blocked by BLOCK-005
2. **Budget bypass**: Forge `tokensUsed = 0` on AgentRun while calling expensive operations — verify cost guardrail re-queries DB
3. **Lock contention**: Submit 2 concurrent runs for same project items — verify `acquireLock()` returns null for second run
4. **Audit chain forgery**: Directly UPDATE an AuditLog row — verify `verifyAuditChain()` reports `valid: false`
5. **RBAC escalation**: Call `checkRunPermission('agent', 'apply')` — verify `allowed: false`
6. **Sandbox resource exhaustion**: Pass a test script that spawns infinite processes — verify pids-limit kills it within timeout

---

## 5. Residual Risks

| Risk | Accepted | Mitigation Plan |
|---|---|---|
| SQLite not multi-writer safe | Yes (single-node) | Migrate to Postgres before multi-instance deploy |
| No auth layer (all routes open) | No — **open item** | Integrate NextAuth or Clerk; wire into RBAC middleware |
| Docker not rootless in dev | Yes (dev only) | ADR-002 documents rootless path for production |
| Cost guardrail uses 80/20 token split heuristic | Yes | Replace with actual per-call input/output tracking once wired |
