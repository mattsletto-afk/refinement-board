export type AdrStatus = 'proposed' | 'accepted' | 'superseded' | 'deprecated'

export interface AdrRecord {
  id: string
  number: number
  title: string
  status: AdrStatus
  context: string
  decision: string
  consequences: string
  agentRunId: string | null
  storyId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface GenerateAdrInput {
  title: string
  context: string
  optionsConsidered: string[]
  decisionDrivers: string[]
  storyId?: string
  agentRunId?: string
}

export interface CreateAdrInput {
  title: string
  status?: AdrStatus
  context: string
  decision: string
  consequences: string
  storyId?: string
  agentRunId?: string
}
