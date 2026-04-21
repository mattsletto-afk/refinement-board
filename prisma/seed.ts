import 'dotenv/config'
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? 'file:./dev.db' })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding database…')

  const jamie = await prisma.persona.upsert({
    where: { id: 'persona-jamie' },
    update: {},
    create: {
      id: 'persona-jamie',
      name: 'Jamie Moore',
      description: 'Salesforce subject matter expert trained on Trailhead.',
      roleType: 'lead',
      chesspiece: 'queen',
      color: '#6366f1',
      agentType: 'ai-agent',
      model: 'claude-sonnet-4-6',
      focusAreas: 'Salesforce, CRM, Agentforce',
      strengths: 'Deep Salesforce knowledge\nCertification expertise\nAgentforce specialist',
      enabled: true,
    },
  })

  const pm = await prisma.persona.upsert({
    where: { id: 'persona-pm' },
    update: {},
    create: {
      id: 'persona-pm',
      name: 'Project Manager',
      description: 'Facilitates planning and keeps the team on track.',
      roleType: 'lead',
      chesspiece: 'king',
      color: '#10b981',
      agentType: 'human',
      focusAreas: 'Planning, Coordination, Risk management',
      enabled: true,
    },
  })

  const dev = await prisma.persona.upsert({
    where: { id: 'persona-dev' },
    update: {},
    create: {
      id: 'persona-dev',
      name: 'Developer',
      description: 'Full-stack developer responsible for implementation.',
      roleType: 'contributor',
      chesspiece: 'knight',
      color: '#3b82f6',
      agentType: 'human',
      focusAreas: 'Frontend, API, Database',
      enabled: true,
    },
  })

  const project = await prisma.project.upsert({
    where: { id: 'project-sample' },
    update: {},
    create: {
      id: 'project-sample',
      name: 'Sample Project',
      description: 'A demo project to explore Refinement Board v2.',
      status: 'active',
      color: '#6366f1',
    },
  })

  const ws1 = await prisma.workstream.upsert({
    where: { id: 'ws-frontend' },
    update: {},
    create: { id: 'ws-frontend', projectId: project.id, name: 'Frontend', color: '#3b82f6', sequence: 0 },
  })
  const ws2 = await prisma.workstream.upsert({
    where: { id: 'ws-backend' },
    update: {},
    create: { id: 'ws-backend', projectId: project.id, name: 'Backend', color: '#10b981', sequence: 1 },
  })

  await prisma.projectPersonaPlacement.upsert({
    where: { id: `${project.id}_${pm.id}_` },
    update: {},
    create: { projectId: project.id, personaId: pm.id, workstreamId: null, sequence: 0 },
  }).catch(() => null)

  const stories = [
    { title: 'User authentication flow', v: 5, r: 4, u: 5, e: 3, board: 'Current Backlog', inScope: true, ws: ws1.id },
    { title: 'Dashboard overview page', v: 4, r: 2, u: 4, e: 2, board: 'Current Backlog', inScope: true, ws: ws1.id },
    { title: 'Export to CSV', v: 3, r: 1, u: 3, e: 2, board: 'Current Backlog', inScope: false, ws: ws2.id },
    { title: 'Email notification system', v: 3, r: 3, u: 2, e: 4, board: 'Discovery', inScope: false, ws: ws2.id },
  ]

  for (let i = 0; i < stories.length; i++) {
    const s = stories[i]
    const base = s.v + s.r + s.u - s.e
    await prisma.userStory.upsert({
      where: { id: `story-${i}` },
      update: {},
      create: {
        id: `story-${i}`,
        projectId: project.id,
        workstreamId: s.ws,
        title: s.title,
        status: 'backlog',
        board: s.board,
        priority: 'medium',
        valueScore: s.v, riskScore: s.r, urgencyScore: s.u, effortScore: s.e,
        meetingPoints: 0, baseScore: base, finalScore: base,
        rank: i, inScope: s.inScope,
      },
    })
  }

  await prisma.milestone.upsert({
    where: { id: 'milestone-1' },
    update: {},
    create: {
      id: 'milestone-1', projectId: project.id, title: 'MVP Launch',
      description: 'First public release with core features.',
      targetDate: new Date('2025-07-01'), status: 'upcoming',
    },
  })

  console.log('Seed complete.')
  console.log(`  Personas: ${[jamie, pm, dev].map((p) => p.name).join(', ')}`)
  console.log(`  Project: ${project.name} with ${stories.length} stories`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
