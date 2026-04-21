// Archive / snapshot business rules

import type { Project, ProjectExport, ProjectSnapshot } from './types'

export function canArchive(project: Project): boolean {
  return project.status === 'active'
}

export function canRestore(snapshot: ProjectSnapshot): boolean {
  return !!snapshot.dataJson
}

// Serialize project data into a snapshot payload
export function buildSnapshotData(data: Omit<ProjectExport, 'exportedAt'>): string {
  const payload: ProjectExport = {
    ...data,
    exportedAt: new Date().toISOString(),
  }
  return JSON.stringify(payload)
}

// Parse snapshot back to structured data
export function parseSnapshot(snapshot: ProjectSnapshot): ProjectExport | null {
  try {
    return JSON.parse(snapshot.dataJson) as ProjectExport
  } catch {
    return null
  }
}

export const START_FRESH_CARRY_FORWARD_OPTIONS = [
  { key: 'personas', label: 'Persona placements' },
  { key: 'categories', label: 'Category definitions' },
  { key: 'workstreams', label: 'Workstream names and colors' },
  { key: 'milestones', label: 'Milestones (upcoming only)' },
] as const

export type CarryForwardKey = (typeof START_FRESH_CARRY_FORWARD_OPTIONS)[number]['key']
