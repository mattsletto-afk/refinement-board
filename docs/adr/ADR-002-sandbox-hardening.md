# ADR-002: Sandbox Hardening — seccomp, Rootless Execution & CIS Benchmark Compliance

**Status:** ACCEPTED  
**Date:** 2026-04-19  
**Implements:** Rank 11 — Sandbox Hardening story  
**Depends on:** ADR-001 (Docker + seccomp architecture decision)

---

## What was hardened

### 1. seccomp syscall filter

Custom profile at `infra/seccomp/agent-sandbox.json`.

- Default action: `SCMP_ACT_ERRNO` (deny everything not explicitly allowed)
- Explicit deny list for privilege-escalation syscalls:
  - `ptrace`, `process_vm_readv/writev` — no memory introspection
  - `kexec_load`, `kexec_file_load` — no kernel replacement
  - `mount`, `umount2`, `pivot_root`, `chroot` — no namespace escape
  - `init_module`, `finit_module` — no kernel module loading
  - `iopl`, `ioperm` — no direct hardware I/O
  - `open_by_handle_at` — no file handle bypass

### 2. Linux capability drops

All capabilities dropped via `--cap-drop=ALL` (see `toDockerFlags()` in `resourceLimits.ts`).  
No capabilities are added back. Agents do not need `CAP_NET_BIND_SERVICE`, `CAP_SYS_ADMIN`, etc.

### 3. Read-only root filesystem

`--read-only` flag. Only two writable surfaces:
- `/tmp` — tmpfs, `noexec`, `nosuid`, 64MB cap, destroyed on container exit
- `/output` — named volume, bind-mounted from host, audited on collection

### 4. No-new-privileges

`--security-opt=no-new-privileges` prevents `setuid` binaries and seccomp filter bypass via `execve`.

### 5. Resource limits

Enforced via `resourceLimits.ts`:

| Resource | Default | Override path |
|----------|---------|---------------|
| CPU      | 0.5 cores | `AGENT_OVERRIDES[agentId].cpus` |
| Memory   | 512 MB  | `AGENT_OVERRIDES[agentId].memory` |
| PIDs     | 64      | `AGENT_OVERRIDES[agentId].pidsLimit` |
| Timeout  | 30s hard kill | `AGENT_OVERRIDES[agentId].timeoutMs` |
| Network  | `none`  | `AGENT_OVERRIDES[agentId].networkMode = 'bridge'` (requires explicit opt-in) |

### 6. Non-root user

Base image creates `sandbox` group + user with no shell (`/bin/false`). All agent code runs as UID/GID of `sandbox`. Root inside container is not the host root (Docker user namespace remapping recommended for production).

### 7. Rootless Docker (recommended for production)

Development currently runs with rootful Docker. Production deployment should use:

```bash
dockerd-rootless-setuptool.sh install
export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock
```

Rootless mode means the Docker daemon itself runs as an unprivileged user. Container UID 0 maps to the unprivileged host UID — not to host root.

### 8. CIS Docker Benchmark compliance checklist

| CIS Control | Status | Notes |
|-------------|--------|-------|
| 4.1 Non-root user | ✅ | `sandbox` user in image |
| 4.5 Read-only FS  | ✅ | `--read-only` flag |
| 4.6 Healthcheck   | ⏳ | Not applicable for ephemeral runners |
| 5.1 AppArmor/seccomp | ✅ | Custom seccomp profile applied |
| 5.4 Privileged container | ✅ | Not privileged |
| 5.6 Bind-mount sensitive dirs | ✅ | Only `/workspace` (ro) and `/output` (rw) |
| 5.7 SSH in container | ✅ | No SSH, no shell |
| 5.10 Memory limit | ✅ | `--memory=512m` |
| 5.11 CPU priority | ✅ | `--cpus=0.5` |
| 5.14 PIDs limit | ✅ | `--pids-limit=64` |
| 5.25 No-new-privileges | ✅ | `--security-opt=no-new-privileges` |
| 5.28 Host network | ✅ | `--network=none` default |
| 5.31 Docker socket | ✅ | Not mounted |

### 9. CI integration (GitHub Actions)

Add to `.github/workflows/ci.yml`:

```yaml
- name: CIS Docker Benchmark
  run: |
    docker run --rm --net host --pid host --userns host \
      --cap-add audit_control \
      -v /var/lib:/var/lib \
      -v /var/run/docker.sock:/var/run/docker.sock \
      -v /etc:/etc:ro \
      docker/docker-bench-security
```

### 10. Escape-attempt test

Integration test in `src/infrastructure/sandbox/__tests__/escapeAttempt.integration.ts` (requires Docker):

```typescript
// Verify ptrace is blocked
const result = await runInSandbox({
  agentId: 'test',
  runId:   'escape-test',
  script:  `
    const { execSync } = require('child_process');
    try {
      execSync('strace ls');
      process.exit(1); // should never reach
    } catch (e) {
      process.exit(0); // expected: permission denied
    }
  `
})
expect(result.exitCode).toBe(0)
```

---

## Residual risks

| Risk | Mitigation | Owner |
|------|-----------|-------|
| Rootful Docker daemon | Rootless mode in prod; seccomp + caps mitigate | DevOps |
| Container image supply chain | Pin to SHA digest in CI | Platform |
| Side-channel timing attacks | Out of scope at current threat level | Future |
| 64MB tmpfs overflow → OOM | Agent kills itself; monitored via sandbox.timeout | Automatic |
