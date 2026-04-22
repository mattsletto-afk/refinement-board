import { NextResponse } from 'next/server'
import { getPersona, updatePersona, deletePersona } from '@/src/infrastructure/db/personas'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const persona = await getPersona(id)
  if (!persona) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(persona)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const persona = await updatePersona(id, body)
  return NextResponse.json(persona)
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await deletePersona(id)
  return NextResponse.json({ ok: true })
}
