import { NextResponse } from 'next/server'
import { prisma } from '@/src/infrastructure/db/client'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const jobs = await prisma.exportJob.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' } })
  return NextResponse.json(jobs)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { type } = await req.json()
  if (!['json', 'csv', 'markdown'].includes(type))
    return NextResponse.json({ error: 'type must be json | csv | markdown' }, { status: 400 })

  // Load project data
  const project = await prisma.project.findUnique({
    where: { id },
    include: { workstreams: true, epics: true, features: true, userStories: true, tasks: true },
  })
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  let content = ''
  const stories = project.userStories

  if (type === 'json') {
    content = JSON.stringify({ project: { id: project.id, name: project.name }, workstreams: project.workstreams, epics: project.epics, features: project.features, stories, tasks: project.tasks }, null, 2)
  } else if (type === 'csv') {
    const header = 'id,title,status,board,priority,finalScore,epicId,workstreamId'
    const rows = stories.map((s) => [s.id, `"${s.title.replace(/"/g, '""')}"`, s.status, s.board, s.priority, s.finalScore, s.epicId ?? '', s.workstreamId ?? ''].join(','))
    content = [header, ...rows].join('\n')
  } else {
    const lines = [`# ${project.name} — Backlog Export\n`]
    for (const ws of project.workstreams) {
      lines.push(`## ${ws.name}`)
      const wsStories = stories.filter((s) => s.workstreamId === ws.id)
      for (const s of wsStories) lines.push(`- **${s.title}** (${s.status}, score: ${s.finalScore})`)
      lines.push('')
    }
    content = lines.join('\n')
  }

  const job = await prisma.exportJob.create({
    data: { projectId: id, type, status: 'complete', metadata: JSON.stringify({ size: content.length, storyCount: stories.length }) },
  })

  return NextResponse.json({ job, content }, { status: 201 })
}
