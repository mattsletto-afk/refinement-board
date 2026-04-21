import { NextResponse } from 'next/server'
import { updateTask, deleteTask } from '@/src/infrastructure/db/projects'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const task = await updateTask(id, body)
  return NextResponse.json(task)
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await deleteTask(id)
  return NextResponse.json({ ok: true })
}
