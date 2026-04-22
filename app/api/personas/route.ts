import { NextResponse } from 'next/server'
import { listPersonas, createPersona } from '@/src/infrastructure/db/personas'

export async function GET() {
  const personas = await listPersonas()
  return NextResponse.json(personas)
}

export async function POST(req: Request) {
  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const persona = await createPersona(body)
  return NextResponse.json(persona, { status: 201 })
}
