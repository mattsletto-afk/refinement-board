/**
 * RBAC — Role-Based Access Control for simulation run routes
 * Restricts autonomous agent actions based on caller role and confidence level.
 */

export type Role = 'admin' | 'lead' | 'contributor' | 'observer' | 'agent'

export type Permission =
  | 'simulation:run'
  | 'simulation:apply'       // apply suggestions without human review
  | 'simulation:auto-commit' // commit to repo without PR review
  | 'simulation:read'
  | 'approval:decide'
  | 'audit:read'

// ── Policy table ──────────────────────────────────────────────────────────────

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'simulation:run', 'simulation:apply', 'simulation:auto-commit',
    'simulation:read', 'approval:decide', 'audit:read',
  ],
  lead: [
    'simulation:run', 'simulation:apply',
    'simulation:read', 'approval:decide', 'audit:read',
  ],
  contributor: [
    'simulation:run', 'simulation:read',
  ],
  observer: [
    'simulation:read', 'audit:read',
  ],
  agent: [
    // Agents can trigger simulations and read but cannot self-approve or auto-commit
    'simulation:run', 'simulation:read',
  ],
}

// ── Confidence gate ───────────────────────────────────────────────────────────

// High-confidence agent suggestions may be auto-applied only by privileged roles.
// Low/medium confidence always requires human review.
const AUTO_APPLY_MIN_CONFIDENCE: Record<Role, 'high' | 'medium' | 'low' | 'never'> = {
  admin:       'medium',
  lead:        'high',
  contributor: 'never',
  observer:    'never',
  agent:       'never',
}

// ── Public API ────────────────────────────────────────────────────────────────

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

export function canAutoApply(role: Role, confidence: 'high' | 'medium' | 'low'): boolean {
  const threshold = AUTO_APPLY_MIN_CONFIDENCE[role]
  if (threshold === 'never') return false
  const levels = { high: 3, medium: 2, low: 1 }
  return levels[confidence] >= levels[threshold]
}

export interface RbacCheckResult {
  allowed:     boolean
  reason?:     string
  requiredRole?: Role
}

export function checkRunPermission(
  callerRole: Role,
  action: 'run' | 'apply' | 'auto-commit' | 'read',
  confidence?: 'high' | 'medium' | 'low',
): RbacCheckResult {
  const permMap: Record<string, Permission> = {
    run:         'simulation:run',
    apply:       'simulation:apply',
    'auto-commit': 'simulation:auto-commit',
    read:        'simulation:read',
  }

  const perm = permMap[action]
  if (!perm) return { allowed: false, reason: `Unknown action: ${action}` }

  if (!hasPermission(callerRole, perm)) {
    return {
      allowed:     false,
      reason:      `Role '${callerRole}' lacks permission '${perm}'`,
      requiredRole: action === 'auto-commit' ? 'admin' : 'lead',
    }
  }

  if (action === 'apply' && confidence) {
    if (!canAutoApply(callerRole, confidence)) {
      return {
        allowed:     false,
        reason:      `Role '${callerRole}' cannot auto-apply '${confidence}' confidence suggestions`,
        requiredRole: 'lead',
      }
    }
  }

  return { allowed: true }
}

// ── Middleware helper (Next.js route handler) ─────────────────────────────────

export function getRoleFromRequest(req: { headers: { get(name: string): string | null } }): Role {
  // In production: validate JWT/session and extract role claim.
  // For now: X-Agent-Role header (trusted internal calls only) or default to 'contributor'.
  const headerRole = req.headers.get('x-agent-role') as Role | null
  if (headerRole && headerRole in ROLE_PERMISSIONS) return headerRole
  return 'contributor'
}
