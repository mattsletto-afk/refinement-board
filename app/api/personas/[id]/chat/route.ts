import { NextResponse } from 'next/server'
import { getPersona } from '@/src/infrastructure/db/personas'

const RAG_SERVER = process.env.RAG_SERVER ?? 'http://localhost:5555'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { message, history = [] } = body

  if (!message?.trim()) return NextResponse.json({ error: 'message required' }, { status: 400 })

  const persona = await getPersona(id)
  if (!persona) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (persona.agentType !== 'ai-agent') return NextResponse.json({ error: 'not an AI agent' }, { status: 400 })

  try {
    const res = await fetch(`${RAG_SERVER}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona: persona.name, message, history }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json({ error: (err as { error?: string }).error ?? 'RAG server error' }, { status: 502 })
    }
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({ error: 'RAG server unreachable' }, { status: 502 })
  }
}
