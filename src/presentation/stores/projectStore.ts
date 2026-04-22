'use client'
import { create } from 'zustand'
import type { Project, Workstream, UserStory, Persona, PersonaPlacement } from '@/src/domain/types'

interface ProjectStore {
  // Active project
  activeProjectId: string | null
  setActiveProjectId: (id: string | null) => void

  // Projects
  projects: Project[]
  setProjects: (p: Project[]) => void
  upsertProject: (p: Project) => void

  // Workstreams
  workstreams: Workstream[]
  setWorkstreams: (w: Workstream[]) => void

  // Stories
  stories: UserStory[]
  setStories: (s: UserStory[]) => void
  upsertStory: (s: UserStory) => void
  removeStory: (id: string) => void

  // Personas
  personas: Persona[]
  setPersonas: (p: Persona[]) => void
  upsertPersona: (p: Persona) => void
  removePersona: (id: string) => void

  // Placements
  placements: PersonaPlacement[]
  setPlacements: (p: PersonaPlacement[]) => void
}

export const useProjectStore = create<ProjectStore>((set) => ({
  activeProjectId: null,
  setActiveProjectId: (id) => set({ activeProjectId: id }),

  projects: [],
  setProjects: (projects) => set({ projects }),
  upsertProject: (p) =>
    set((s) => ({
      projects: s.projects.some((x) => x.id === p.id)
        ? s.projects.map((x) => (x.id === p.id ? p : x))
        : [...s.projects, p],
    })),

  workstreams: [],
  setWorkstreams: (workstreams) => set({ workstreams }),

  stories: [],
  setStories: (stories) => set({ stories }),
  upsertStory: (story) =>
    set((s) => ({
      stories: s.stories.some((x) => x.id === story.id)
        ? s.stories.map((x) => (x.id === story.id ? story : x))
        : [...s.stories, story],
    })),
  removeStory: (id) => set((s) => ({ stories: s.stories.filter((x) => x.id !== id) })),

  personas: [],
  setPersonas: (personas) => set({ personas }),
  upsertPersona: (p) =>
    set((s) => ({
      personas: s.personas.some((x) => x.id === p.id)
        ? s.personas.map((x) => (x.id === p.id ? p : x))
        : [...s.personas, p],
    })),
  removePersona: (id) => set((s) => ({ personas: s.personas.filter((x) => x.id !== id) })),

  placements: [],
  setPlacements: (placements) => set({ placements }),
}))
