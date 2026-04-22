const { describe, test, expect, beforeEach } = require('@jest/globals')

// Inline the adapter logic — no module imports allowed in sandbox

function parseSprintStatus(raw) {
  const normalized = raw.toLowerCase().trim()
  if (normalized === 'active') return 'active'
  if (normalized === 'closed' || normalized === 'complete') return 'closed'
  return 'future'
}

function parseNullableDate(raw) {
  if (raw === null || raw === undefined || raw.trim() === '') return null
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

function buildColumnStatusMappings(boardId, boardConfigs) {
  const config = boardConfigs.find((c) => c.boardId === boardId)
  if (!config) return []
  return config.columns.map((col) => ({
    columnId: col.id,
    columnName: col.name,
    statusIds: col.statusIds,
  }))
}

function adaptJiraSprint(row, boardConfigs) {
  const resolvedBoardId = row.RAPID_VIEW_ID !== null && row.RAPID_VIEW_ID !== undefined
    ? row.RAPID_VIEW_ID
    : row.BOARD_ID

  return {
    id: row.ID,
    name: row.NAME,
    status: parseSprintStatus(row.STATE),
    startDate: parseNullableDate(row.START_DATE),
    endDate: parseNullableDate(row.END_DATE),
    completeDate: parseNullableDate(row.COMPLETE_DATE),
    goal: row.GOAL !== undefined ? row.GOAL : null,
    boardId: resolvedBoardId,
    columnStatusMappings: buildColumnStatusMappings(resolvedBoardId, boardConfigs),
  }
}

function adaptJiraSprints(rows, boardConfigs) {
  return rows.map((row) => adaptJiraSprint(row, boardConfigs))
}

const boardConfigs = [
  {
    boardId: 1,
    columns: [
      { id: 10, name: 'To Do', statusIds: ['1', '2'] },
      { id: 20, name: 'In Progress', statusIds: ['3'] },
      { id: 30, name: 'Done', statusIds: ['6', '10002'] },
    ],
  },
  {
    boardId: 2,
    columns: [
      { id: 11, name: 'Backlog', statusIds: ['1'] },
      { id: 21, name: 'Review', statusIds: ['4', '5'] },
    ],
  },
]

const activeSprintRow = {
  ID: 42,
  NAME: 'Sprint 16',
  STATE: 'ACTIVE',
  START_DATE: '2024-01-08T00:00:00.000+0000',
  END_DATE: '2024-01-22T00:00:00.000+0000',
  COMPLETE_DATE: null,
  GOAL: 'Deliver agent execution foundation',
  BOARD_ID: 1,
  RAPID_VIEW_ID: 1,
}

const closedSprintRow = {
  ID: 10,
  NAME: 'Sprint 10',
  STATE: 'closed',
  START_DATE: '2023-10-01T00:00:00.000+0000',
  END_DATE: '2023-10-15T00:00:00.000+0000',
  COMPLETE_DATE: '2023-10-15T12:00:00.000+0000',
  GOAL: null,
  BOARD_ID: 1,
  RAPID_VIEW_ID: null,
}

const futureSprintRow = {
  ID: 50,
  NAME: 'Sprint 17',
  STATE: 'future',
  START_DATE: null,
  END_DATE: null,
  COMPLETE_DATE: null,
  GOAL: null,
  BOARD_ID: 2,
  RAPID_VIEW_ID: 2,
}

const completeStateRow = {
  ID: 7,
  NAME: 'Sprint 7',
  STATE: 'complete',
  START_DATE: '2023-05-01T00:00:00.000+0000',
  END_DATE: '2023-05-15T00:00:00.000+0000',
  COMPLETE_DATE: '2023-05-15T00:00:00.000+0000',
  GOAL: null,
  BOARD_ID: 1,
  RAPID_VIEW_ID: 1,
}

beforeEach(() => jest.clearAllMocks())

describe('parseSprintStatus', () => {
  test('maps ACTIVE (uppercase) to active', () => {
    expect(parseSprintStatus('ACTIVE')).toBe('active')
  })

  test('maps active (lowercase) to active', () => {
    expect(parseSprintStatus('active')).toBe('active')
  })

  test('maps closed to closed', () => {
    expect(parseSprintStatus('closed')).toBe('closed')
  })

  test('maps CLOSED (uppercase) to closed', () => {
    expect(parseSprintStatus('CLOSED')).toBe('closed')
  })

  test('maps complete to closed', () => {
    expect(parseSprintStatus('complete')).toBe('closed')
  })

  test('maps COMPLETE (uppercase) to closed', () => {
    expect(parseSprintStatus('COMPLETE')).toBe('closed')
  })

  test('maps future to future', () => {
    expect(parseSprintStatus('future')).toBe('future')
  })

  test('maps unknown state to future', () => {
    expect(parseSprintStatus('PENDING')).toBe('future')
  })

  test('handles whitespace in state string', () => {
    expect(parseSprintStatus('  active  ')).toBe('active')
  })
})

describe('parseNullableDate', () => {
  test('returns null for null input', () => {
    expect(parseNullableDate(null)).toBeNull()
  })

  test('returns null for empty string', () => {
    expect(parseNullableDate('')).toBeNull()
  })

  test('returns null for whitespace-only string', () => {
    expect(parseNullableDate('   ')).toBeNull()
  })

  test('parses valid ISO date string into Date', () => {
    const result = parseNullableDate('2024-01-08T00:00:00.000+0000')
    expect(result).toBeInstanceOf(Date)
    expect(isNaN(result.getTime())).toBe(false)
  })

  test('returns null for invalid date string', () => {
    expect(parseNullableDate('not-a-date')).toBeNull()
  })

  test('parses ISO format correctly', () => {
    const result = parseNullableDate('2024-01-22T00:00:00.000+0000')
    expect(result).toBeInstanceOf(Date)
    expect(result.getFullYear()).toBe(2024)
  })
})

describe('buildColumnStatusMappings', () => {
  test('returns empty array when no board config matches', () => {
    const result = buildColumnStatusMappings(999, boardConfigs)
    expect(result).toEqual([])
  })

  test('returns empty array for empty boardConfigs', () => {
    const result = buildColumnStatusMappings(1, [])
    expect(result).toEqual([])
  })

  test('returns correct mappings for board 1', () => {
    const result = buildColumnStatusMappings(1, boardConfigs)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ columnId: 10, columnName: 'To Do', statusIds: ['1', '2'] })
    expect(result[1]).toEqual({ columnId: 20, columnName: 'In Progress', statusIds: ['3'] })
    expect(result[2]).toEqual({ columnId: 30, columnName: 'Done', statusIds: ['6', '10002'] })
  })

  test('returns correct mappings for board 2', () => {
    const result = buildColumnStatusMappings(2, boardConfigs)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ columnId: 11, columnName: 'Backlog', statusIds: ['1'] })
    expect(result[1]).toEqual({ columnId: 21, columnName: 'Review', statusIds: ['4', '5'] })
  })

  test('each mapping includes columnId, columnName, and statusIds', () => {
    const result = buildColumnStatusMappings(1, boardConfigs)
    result.forEach((mapping) => {
      expect(mapping).toHaveProperty('columnId')
      expect(mapping).toHaveProperty('columnName')
      expect(mapping).toHaveProperty('statusIds')
      expect(Array.isArray(mapping.statusIds)).toBe(true)
    })
  })
})

describe('adaptJiraSprint', () => {
  test('maps ID to sprint id', () => {
    const sprint = adaptJiraSprint(activeSprintRow, boardConfigs)
    expect(sprint.id).toBe(42)
  })

  test('maps NAME to sprint name', () => {
    const sprint = adaptJiraSprint(activeSprintRow, boardConfigs)
    expect(sprint.name).toBe('Sprint 16')
  })

  test('maps ACTIVE STATE to active status', () => {
    const sprint = adaptJiraSprint(activeSprintRow, boardConfigs)
    expect(sprint.status).toBe('active')
  })

  test('maps closed STATE to closed status', () => {
    const sprint = adaptJiraSprint(closedSprintRow, boardConfigs)
    expect(sprint.status).toBe('closed')
  })

  test('maps future STATE to future status', () => {
    const sprint = adaptJiraSprint(futureSprintRow, boardConfigs)
    expect(sprint.status).toBe('future')
  })

  test('maps complete STATE to closed status', () => {
    const sprint = adaptJiraSprint(completeStateRow, boardConfigs)
    expect(sprint.status).toBe('closed')
  })

  test('maps START_DATE to startDate as Date', () => {
    const sprint = adaptJiraSprint(activeSprintRow, boardConfigs)
    expect(sprint.startDate).toBeInstanceOf(Date)
  })

  test('maps null START_DATE to null startDate', () => {
    const sprint = adaptJiraSprint(futureSprintRow, boardConfigs)
    expect(sprint.startDate).toBeNull()
  })

  test('maps END_DATE to endDate as Date', () => {
    const sprint = adaptJiraSprint(activeSprintRow, boardConfigs)
    expect(sprint.endDate).toBeInstanceOf(Date)
  })

  test('maps null COMPLETE_DATE to null completeDate', () => {
    const sprint = adaptJiraSprint(activeSprintRow, boardConfigs)
    expect(sprint.completeDate).toBeNull()
  })

  test('maps non-null COMPLETE_DATE to Date', () => {
    const sprint = adaptJiraSprint(closedSprintRow, boardConfigs)
    expect(sprint.completeDate).toBeInstanceOf(Date)
  })

  test('maps GOAL to goal', () => {
    const sprint = adaptJiraSprint(activeSprintRow, boardConfigs)
    expect(sprint.goal).toBe('Deliver agent execution foundation')
  })

  test('maps null GOAL to null goal', () => {
    const sprint = adaptJiraSprint(closedSprintRow, boardConfigs)
    expect(sprint.goal).toBeNull()
  })

  test('uses RAPID_VIEW_ID as boardId when present', () => {
    const sprint = adaptJiraSprint(activeSprintRow, boardConfigs)
    expect(sprint.boardId).toBe(1)
  })

  test('falls back to BOARD_ID when RAPID_VIEW_ID is null', () => {
    const sprint = adaptJiraSprint(closedSprintRow, boardConfigs)
    expect(sprint.boardId).toBe(1)
  })

  test('attaches column status mappings from board config', () => {
    const sprint = adaptJiraSprint(activeSprintRow, boardConfigs)
    expect(sprint.columnStatusMappings).toHaveLength(3)
  })

  test('returns empty columnStatusMappings when no config found', () => {
    const rowWithUnknownBoard = { ...activeSprintRow, BOARD_ID: 999, RAPID_VIEW_ID: 999 }
    const sprint = adaptJiraSprint(rowWithUnknownBoard, boardConfigs)
    expect(sprint.columnStatusMappings).toEqual([])
  })

  test('column mappings contain correct status IDs', () => {
    const sprint = adaptJiraSprint(activeSprintRow, boardConfigs)
    const doneColumn = sprint.columnStatusMappings.find((m) => m.columnName === 'Done')
    expect(doneColumn).toBeDefined()
    expect(doneColumn.statusIds).toContain('6')
    expect(doneColumn.statusIds).toContain('10002')
  })

  test('uses board 2 config for sprint on board 2', () => {
    const sprint = adaptJiraSprint(futureSprintRow, boardConfigs)
    expect(sprint.boardId).toBe(2)
    expect(sprint.columnStatusMappings).toHaveLength(2)
    expect(sprint.columnStatusMappings[0].columnName).toBe('Backlog')
  })
})

describe('adaptJiraSprints', () => {
  test('returns empty array for empty input', () => {
    const result = adaptJiraSprints([], boardConfigs)
    expect(result).toEqual([])
  })

  test('maps multiple rows to Sprint array', () => {
    const rows = [activeSprintRow, closedSprintRow, futureSprintRow]
    const result = adaptJiraSprints(rows, boardConfigs)
    expect(result).toHaveLength(3)
  })

  test('preserves order of input rows', () => {
    const rows = [closedSprintRow, activeSprintRow, futureSprintRow]
    const result = adaptJiraSprints(rows, boardConfigs)
    expect(result[0].id).toBe(10)
    expect(result[1].id).toBe(42)
    expect(result[2].id).toBe(50)
  })

  test('each result has correct status', () => {
    const rows = [activeSprintRow, closedSprintRow, futureSprintRow]
    const result = adaptJiraSprints(rows, boardConfigs)
    expect(result[0].status).toBe('active')
    expect(result[1].status).toBe('closed')
    expect(result[2].status).toBe('future')
  })

  test('each result has column mappings resolved against board configs', () => {
    const rows = [activeSprintRow, futureSprintRow]
    const result = adaptJiraSprints(rows, boardConfigs)
    expect(result[0].columnStatusMappings).toHaveLength(3)
    expect(result[1].columnStatusMappings).toHaveLength(2)
  })

  test('single-element input produces single-element output', () => {
    const result = adaptJiraSprints([activeSprintRow], boardConfigs)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Sprint 16')
  })

  test('handles sprint with complete state in batch', () => {
    const rows = [completeStateRow]
    const result = adaptJiraSprints(rows, boardConfigs)
    expect(result[0].status).toBe('closed')
  })
})

describe('column-to-status mapping edge cases', () => {
  test('column with empty statusIds is preserved', () => {
    const configWithEmpty = [
      {
        boardId: 5,
        columns: [
          { id: 100, name: 'Waiting', statusIds: [] },
        ],
      },
    ]
    const row = { ...activeSprintRow, BOARD_ID: 5, RAPID_VIEW_ID: 5 }
    const sprint = adaptJiraSprint(row, configWithEmpty)
    expect(sprint.columnStatusMappings).toHaveLength(1)
    expect(sprint.columnStatusMappings[0].statusIds).toEqual([])
  })

  test('board with many columns is fully mapped', () => {
    const configWithMany = [
      {
        boardId: 6,
        columns: [
          { id: 1, name: 'Backlog', statusIds: ['1'] },
          { id: 2, name: 'Selected', statusIds: ['2'] },
          { id: 3, name: 'In Progress', statusIds: ['3'] },
          { id: 4, name: 'In Review', statusIds: ['4'] },
          { id: 5, name: 'Testing', statusIds: ['5'] },
          { id: 6, name: 'Done', statusIds: ['6'] },
        ],
      },
    ]
    const row = { ...activeSprintRow, BOARD_ID: 6, RAPID_VIEW_ID: 6 }
    const sprint = adaptJiraSprint(row, configWithMany)
    expect(sprint.columnStatusMappings).toHaveLength(6)
    expect(sprint.columnStatusMappings.map((m) => m.columnName)).toEqual([
      'Backlog', 'Selected', 'In Progress', 'In Review', 'Testing', 'Done',
    ])
  })

  test('status IDs are preserved as strings not coerced to numbers', () => {
    const result = buildColumnStatusMappings(1, boardConfigs)
    result.forEach((mapping) => {
      mapping.statusIds.forEach((sid) => {
        expect(typeof sid).toBe('string')
      })
    })
  })
})
