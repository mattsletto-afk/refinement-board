import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getProject, updateProject, archiveProject } from '@/src/infrastructure/db/projects'

async function requireAccess(id: string) {
  const { userId } = await auth()
  const project = await getProject(id)
  if (!project) return { error: NextResponse.json({ error: 'not found' }, { status: 404 }) }
  // Allow access if project is unclaimed (null) or owned by current user
  if (project.clerkUserId && project.clerkUserId !== userId) {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  }
  return { project }
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { project, error } = await requireAccess(id)
  if (error) return error
  return NextResponse.json(project)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await requireAccess(id)
  if (error) return error
  const body = await req.json()
  const project = await updateProject(id, body)
  return NextResponse.json(project)
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await requireAccess(id)
  if (error) return error
  await archiveProject(id)
  return NextResponse.json({ ok: true })
}
