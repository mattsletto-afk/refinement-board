import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { listProjects, createProject } from '@/src/infrastructure/db/projects'

export async function GET() {
  const { userId } = await auth()
  const projects = await listProjects(userId ?? undefined)
  return NextResponse.json(projects)
}

export async function POST(req: Request) {
  const { userId } = await auth()
  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const project = await createProject({ ...body, clerkUserId: userId ?? null })
  return NextResponse.json(project, { status: 201 })
}
