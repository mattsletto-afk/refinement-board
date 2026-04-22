export type SprintStatus = 'future' | 'active' | 'closed'

export type ColumnStatusMapping = {
  columnId: number
  columnName: string
  statusIds: string[]
}

export type Sprint = {
  id: number
  name: string
  status: SprintStatus
  startDate: Date | null
  endDate: Date | null
  completeDate: Date | null
  goal: string | null
  boardId: number
  columnStatusMappings: ColumnStatusMapping[]
}
