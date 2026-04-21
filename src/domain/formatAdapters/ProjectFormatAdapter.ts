export interface ImportedStory {
  externalId: string
  title: string
  description: string | null
  status: 'backlog' | 'active' | 'done'
  priority: 'low' | 'medium' | 'high' | 'critical'
  storyPoints: number | null
  epicTitle: string | null
  assignee: string | null
  labels: string[]
}

export interface ImportedEpic {
  externalId: string
  title: string
  description: string | null
  status: 'backlog' | 'active' | 'done'
}

export interface ImportedSprint {
  externalId: string
  name: string
  state: 'future' | 'active' | 'closed'
  startDate: Date | null
  endDate: Date | null
  storyIds: string[]
}

export interface ImportDTO {
  projectName: string
  projectDescription: string | null
  epics: ImportedEpic[]
  stories: ImportedStory[]
  sprints: ImportedSprint[]
  parseErrors: Array<{ entity: string; id: string | null; message: string }>
}

export interface ProjectFormatAdapter {
  readonly formatName: string
  readonly fileExtensions: string[]
  parse(fileContent: string | Buffer): Promise<ImportDTO>
  serialize?(projectData: unknown): Promise<string>
}
