import { describe, it, expect } from 'vitest'
import { hasPermission, canAutoApply, checkRunPermission } from '../rbac'

describe('hasPermission', () => {
  it('admin has all permissions', () => {
    expect(hasPermission('admin', 'simulation:auto-commit')).toBe(true)
    expect(hasPermission('admin', 'approval:decide')).toBe(true)
    expect(hasPermission('admin', 'audit:read')).toBe(true)
  })

  it('contributor cannot apply or auto-commit', () => {
    expect(hasPermission('contributor', 'simulation:apply')).toBe(false)
    expect(hasPermission('contributor', 'simulation:auto-commit')).toBe(false)
  })

  it('observer can only read', () => {
    expect(hasPermission('observer', 'simulation:read')).toBe(true)
    expect(hasPermission('observer', 'simulation:run')).toBe(false)
  })

  it('agent can run and read but not approve or commit', () => {
    expect(hasPermission('agent', 'simulation:run')).toBe(true)
    expect(hasPermission('agent', 'simulation:apply')).toBe(false)
    expect(hasPermission('agent', 'simulation:auto-commit')).toBe(false)
    expect(hasPermission('agent', 'approval:decide')).toBe(false)
  })
})

describe('canAutoApply', () => {
  it('admin can auto-apply medium and high confidence', () => {
    expect(canAutoApply('admin', 'high')).toBe(true)
    expect(canAutoApply('admin', 'medium')).toBe(true)
    expect(canAutoApply('admin', 'low')).toBe(false)
  })

  it('lead can only auto-apply high confidence', () => {
    expect(canAutoApply('lead', 'high')).toBe(true)
    expect(canAutoApply('lead', 'medium')).toBe(false)
  })

  it('contributor and agent can never auto-apply', () => {
    expect(canAutoApply('contributor', 'high')).toBe(false)
    expect(canAutoApply('agent', 'high')).toBe(false)
  })
})

describe('checkRunPermission', () => {
  it('allows admin to auto-commit', () => {
    const r = checkRunPermission('admin', 'auto-commit')
    expect(r.allowed).toBe(true)
  })

  it('blocks lead from auto-commit', () => {
    const r = checkRunPermission('lead', 'auto-commit')
    expect(r.allowed).toBe(false)
    expect(r.reason).toContain('auto-commit')
  })

  it('blocks contributor from applying suggestions', () => {
    const r = checkRunPermission('contributor', 'apply', 'high')
    expect(r.allowed).toBe(false)
  })

  it('blocks lead from applying low-confidence suggestions', () => {
    const r = checkRunPermission('lead', 'apply', 'low')
    expect(r.allowed).toBe(false)
    expect(r.reason).toContain('low')
  })

  it('allows lead to apply high-confidence suggestions', () => {
    const r = checkRunPermission('lead', 'apply', 'high')
    expect(r.allowed).toBe(true)
  })
})
