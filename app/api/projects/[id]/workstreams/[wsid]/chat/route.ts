import { NextResponse } from 'next/server'
import { prisma } from '@/src/infrastructure/db/client'

const RAG_SERVER = process.env.RAG_SERVER ?? 'http://localhost:5555'

export async function POST(req: Request, { params }: { params: Promise<{ id: string; wsid: string }> }) {
  const { wsid } = await params
  const { message, history = [] } = await req.json()

  if (!message?.trim()) return NextResponse.json({ error: 'message required' }, { status: 400 })

  const placements = await prisma.projectPersonaPlacement.findMany({
    where: { workstreamId: wsid },
    orderBy: { sequence: 'asc' },
    include: { persona: true },
  })

  if (!placements.length) return NextResponse.json({ error: 'no personas in this workstream' }, { status: 400 })

  const members = placements.flatMap(pl => pl.persona ? [{
    id: pl.persona.id,
    name: pl.persona.name,
    role: pl.persona.description,
    notes: pl.persona.focusAreas,
    agentType: pl.persona.agentType,
    piece: pl.persona.chesspiece,
    color: pl.persona.color,
  }] : [])

  try {
    const res = await fetch(`${RAG_SERVER}/stream-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history, members }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json({ error: (err as { error?: string }).error ?? 'RAG error' }, { status: 502 })
    }
    const data = await res.json() as { replies: { id: string; name: string; reply: string }[] }
    const replies = data.replies.map(r => {
      const m = members.find(x => x.id === r.id)
      return { ...r, piece: m?.piece, color: m?.color, agentType: m?.agentType }
    })
    return NextResponse.json({ replies })
  } catch {
    return NextResponse.json({ error: 'RAG server unreachable' }, { status: 502 })
  }
}
