import type { JiraSprintRow, JiraBoardConfig } from './types'
// col is typed in JiraBoardConfig as { id: number; name: string; statusIds: number[] }
import type { Sprint, SprintStatus, ColumnStatusMapping } from './sprint-types'

function parseSprintStatus(raw: string): SprintStatus {
  const normalized = raw.toLowerCase().trim()
  if (normalized === 'active') return 'active'
  if (normalized === 'closed' || normalized === 'complete') return 'closed'
  return 'future'
}

function parseNullableDate(raw: string | null): Date | null {
  if (raw === null || raw === undefined || raw.trim() === '') return null
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

function buildColumnStatusMappings(
  boardId: number,
  boardConfigs: JiraBoardConfig[]
): ColumnStatusMapping[] {
  const config = boardConfigs.find((c) => c.boardId === boardId)
  if (!config) return []
  return config.columns.map((col) => ({
    columnId: col.id,
    columnName: col.name,
    statusIds: col.statusIds.map(String),
  }))
}

export function adaptJiraSprint(
  row: JiraSprintRow,
  boardConfigs: JiraBoardConfig[]
): Sprint {
  const resolvedBoardId = row.RAPID_VIEW_ID ?? row.BOARD_ID ?? 0

  return {
    id: row.ID,
    name: row.NAME,
    status: parseSprintStatus(row.STATE),
    startDate: parseNullableDate(row.START_DATE),
    endDate: parseNullableDate(row.END_DATE),
    completeDate: parseNullableDate(row.COMPLETE_DATE),
    goal: row.GOAL ?? null,
    boardId: resolvedBoardId,
    columnStatusMappings: buildColumnStatusMappings(resolvedBoardId, boardConfigs),
  }
}

export function adaptJiraSprints(
  rows: JiraSprintRow[],
  boardConfigs: JiraBoardConfig[]
): Sprint[] {
  return rows.map((row) => adaptJiraSprint(row, boardConfigs))
}
