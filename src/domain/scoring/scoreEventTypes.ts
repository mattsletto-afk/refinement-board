export type RunScoreEvent = {
  runId: string
  sprintId: string | null
  itemsCreated: number
  itemsReworked: number
  sprintShipped: boolean
  efficiencyScore: number
  timestamp: string
}
