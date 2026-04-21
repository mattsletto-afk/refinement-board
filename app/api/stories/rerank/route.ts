import { NextResponse } from 'next/server'
import { rerankStories } from '@/src/infrastructure/db/projects'

export async function POST(req: Request) {
  const { ids } = await req.json()
  if (!Array.isArray(ids)) return NextResponse.json({ error: 'ids array required' }, { status: 400 })
  await rerankStories(ids)
  return NextResponse.json({ ok: true })
}
