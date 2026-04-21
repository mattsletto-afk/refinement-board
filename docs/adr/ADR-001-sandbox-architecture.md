# ADR-001: Agent Execution Sandbox Architecture

**Status:** ACCEPTED  
**Date:** 2026-04-19  
**Deciders:** Technical Lead, Delivery Lead, Risk & Compliance  
**Consent window:** 48 hours from circulation (silent = accepted)

---

## Context

The Refinement Board self-building system requires a safe execution environment for AI-generated code. Agents produce TypeScript/Python artifacts that must run in isolation with no ability to:
- Escape to the host filesystem
- Make unbounded network calls
- Consume unbounded CPU/memory
- Persist state across runs without explicit approval

The platform is a Next.js 16 monolith on a Linux host with Docker available. We need a sandbox that is:
1. Reproducible across dev and CI
2. Auditable (all inputs/outputs captured)
3. Revocable (can disable per-agent or globally)
4. Fast to spin up (< 5s cold start acceptable)

## Decision

**Accept: Docker container per execution run with seccomp syscall filtering.**

### Runtime stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Container runtime | Docker (rootless where available) | Already installed; well-understood operational model |
| Syscall filter | seccomp default profile + deny `ptrace`, `mount`, `clone` | Blocks privilege escalation and namespace escape |
| Network | `--network=none` by default; opt-in named bridge for approved HTTP | Zero-trust default |
| Filesystem | Read-only root + tmpfs `/tmp` + named volume for outputs | Immutable base, ephemeral scratch |
| Resource limits | `--cpus=0.5 --memory=512m --pids-limit=64` | Prevents noisy-neighbour and fork bombs |
| Execution timeout | 30s hard kill via `docker stop --time=30` | Unblocks queue if agent hangs |

### Seccomp profile

Use Docker's default seccomp profile as the base. Augment with explicit deny for:
- `ptrace`
- `mount` / `umount2`
- `clone` with `CLONE_NEWUSER`
- `kexec_load`
- `open_by_handle_at`

Profile stored at: `infra/seccomp/agent-sandbox.json`

### Image strategy

- Base: `node:22-alpine` (smallest attack surface)
- No package manager in production image (`apk del apk-tools` as final layer)
- Pre-built and pinned by SHA digest in CI
- Tag format: `refinement-sandbox:sha-<git-sha>`

### Audit capture

Every sandbox run produces a structured JSON record:
```json
{
  "runId": "...",
  "agentId": "...",
  "entrypoint": "...",
  "exitCode": 0,
  "stdoutHash": "sha256:...",
  "stderrHash": "sha256:...",
  "durationMs": 1240,
  "networkCalls": [],
  "filesWritten": ["output/result.json"]
}
```

This record is written to the immutable audit log (see ADR-002) before the container is removed.

## Alternatives considered

### gVisor (runsc)

**Rejected for now.** gVisor intercepts syscalls in userspace — stronger isolation than seccomp. But it requires kernel module installation and adds ~200ms overhead per run. Not available on all CI providers. Revisit if seccomp profile proves insufficient.

### WASM sandbox (wasmtime)

**Rejected.** TypeScript agents would require a compile step to WASM. Ecosystem immature for Node.js use cases. The translation layer would add more complexity than the security benefit justifies at current risk level.

### Firecracker microVM

**Rejected.** Sub-100ms startup is impressive but operational complexity is high. KVM required. Disproportionate for a planning tool at this stage.

### No sandbox (process isolation only)

**Rejected.** Agent code is AI-generated and must be treated as untrusted. Process-level isolation (`child_process.fork`) does not prevent filesystem or syscall abuse.

## Consequences

### Positive
- Each agent run is hermetically isolated — bugs cannot cascade to host
- Docker layer cache keeps cold starts under 3s for pre-warmed images
- seccomp profile is auditable and version-controlled
- Fits the existing operational model (team already runs Docker in dev)

### Negative / risks
- Docker daemon must be running; adds a dependency to the dev setup
- rootful Docker is a known privilege escalation path if misconfigured — mitigated by rootless mode preference and seccomp hardening
- Resource limits (512MB) may be too tight for some agent workloads — monitor and adjust; limit is enforced per run, not globally

### Open questions
- Q1: Do we need per-agent network allow-lists, or is `--network=none` sufficient for the first sprint? → **Assume none is sufficient; revisit when HTTP agents are introduced.**
- Q2: Should sandbox images be built in CI or pulled from a registry? → **Build in CI, push to local registry; no external registry dependency in Sprint 16.**

## Implementation checklist (unblocks ADR-001 dependents)

- [ ] `infra/seccomp/agent-sandbox.json` — seccomp profile
- [ ] `infra/docker/Dockerfile.sandbox` — base image
- [ ] `src/infrastructure/sandbox/dockerRunner.ts` — run + kill + audit capture
- [ ] `src/infrastructure/sandbox/resourceLimits.ts` — constants + per-agent overrides
- [ ] Integration test: run a benign script, confirm output captured
- [ ] Integration test: run a script that calls `fork()` excessively, confirm pid limit kills it

---

*Circulated for 48-hour silent consent on 2026-04-19. No objections received = ACCEPTED.*
