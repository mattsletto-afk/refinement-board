import { NextResponse } from 'next/server'
import { prisma } from '@/src/infrastructure/db/client'
import type { WizardData } from '../generate/route'

interface CreateWizardBody {
  data: WizardData
  enabled: Record<keyof WizardData, boolean>
  color?: string
}

function parseRoles(raw: string): Array<{ title: string; count: number; responsibilities: string }> {
  return raw.split('\n').filter(Boolean).map(line => {
    const m = line.match(/^(.+?)\s*\((\d+)\)\s*[—\-–]\s*(.*)$/)
    if (m) return { title: m[1].trim(), count: parseInt(m[2], 10), responsibilities: m[3].trim() }
    return { title: line.trim(), count: 1, responsibilities: '' }
  })
}

function parseEpics(raw: string): string[] {
  return raw.split('\n').map(l => l.replace(/^[-•*\d.]+\s*/, '').trim()).filter(Boolean)
}

export async function POST(req: Request): Promise<NextResponse> {
  const body = await req.json() as CreateWizardBody
  const { data, enabled, color = '#6366f1' } = body

  if (!data.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

  // Create the project
  const project = await prisma.project.create({
    data: {
      name: data.name.trim(),
      description: enabled.description ? (data.description?.trim() ?? '') : '',
      color,
    },
  })

  const projectId = project.id
  const tasks: Promise<unknown>[] = []

  // Workstreams from roles
  if (enabled.roles && data.roles) {
    const roles = parseRoles(data.roles)
    roles.forEach((role, i) => {
      tasks.push(prisma.workstream.create({
        data: { projectId, name: role.title, sequence: i },
      }))
    })
  }

  // Initial epics
  if (enabled.epics && data.epics) {
    const epicTitles = parseEpics(data.epics)
    epicTitles.forEach((title, i) => {
      if (title) tasks.push(prisma.epic.create({
        data: { projectId, title, description: '', status: 'backlog', priority: 'medium', sequence: i },
      }))
    })
  }

  // Tech specs → stored as a project note (Post)
  if (enabled.techSpecs && data.techSpecs) {
    tasks.push(prisma.post.create({
      data: { projectId, title: 'Technical Specifications', content: data.techSpecs, type: 'decision', pinned: true },
    }))
  }

  // Timeline → stored as a pinned post
  if (enabled.timeline && data.timeline) {
    tasks.push(prisma.post.create({
      data: { projectId, title: 'Project Timeline', content: data.timeline, type: 'decision', pinned: true },
    }))
  }

  // Constraints → stored as a pinned post
  if (enabled.constraints && data.constraints) {
    tasks.push(prisma.post.create({
      data: { projectId, title: 'Constraints & Assumptions', content: data.constraints, type: 'decision', pinned: true },
    }))
  }

  // Personas from roles (AI agents)
  if (enabled.roles && data.roles) {
    const roles = parseRoles(data.roles)
    const COLORS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899']
    for (const [i, role] of roles.entries()) {
      const persona = await prisma.persona.upsert({
        where: { id: `wizard-${projectId}-${i}` },
        create: {
          id: `wizard-${projectId}-${i}`,
          name: role.title,
          description: role.responsibilities || `${role.title} on ${data.name}`,
          roleType: role.title,
          color: COLORS[i % COLORS.length],
          agentType: 'human',
          enabled: true,
        },
        update: {},
      })
      tasks.push(prisma.projectPersonaPlacement.create({
        data: { projectId, personaId: persona.id, sequence: i },
      }))
    }
  }

  await Promise.allSettled(tasks)

  return NextResponse.json({ projectId }, { status: 201 })
}
