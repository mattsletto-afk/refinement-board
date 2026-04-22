import { prisma } from '@/src/infrastructure/db/client'
import type { ProjectStateSnapshot } from './diff'

export async function snapshotProject(projectId: string): Promise<ProjectStateSnapshot> {
  const [epics, features, stories, tasks, risks, milestones, workstreams] = await Promise.all([
    prisma.epic.findMany({ where: { projectId }, select: { id: true, title: true, status: true, priority: true } }),
    prisma.feature.findMany({ where: { projectId }, select: { id: true, title: true, epicId: true } }),
    prisma.userStory.findMany({ where: { projectId }, select: { id: true, title: true, status: true, epicId: true, featureId: true } }),
    prisma.task.findMany({ where: { projectId }, select: { id: true, title: true, storyId: true } }),
    prisma.risk.findMany({ where: { projectId }, select: { id: true, title: true, status: true } }),
    prisma.milestone.findMany({ where: { projectId }, select: { id: true, title: true, status: true } }),
    prisma.workstream.findMany({ where: { projectId }, select: { id: true, name: true } }),
  ])

  return {
    capturedAt:  new Date().toISOString(),
    epics:       epics.map(e => ({ id: e.id, title: e.title, status: e.status, priority: e.priority })),
    features:    features.map(f => ({ id: f.id, title: f.title, epicId: f.epicId })),
    stories:     stories.map(s => ({ id: s.id, title: s.title, status: s.status, epicId: s.epicId, featureId: s.featureId })),
    tasks:       tasks.map(t => ({ id: t.id, title: t.title, storyId: t.storyId })),
    risks:       risks.map(r => ({ id: r.id, title: r.title, status: r.status })),
    milestones:  milestones.map(m => ({ id: m.id, title: m.title, status: m.status })),
    workstreams: workstreams.map(w => ({ id: w.id, name: w.name })),
  }
}
