import { NextResponse } from 'next/server'
import { createDocument, listDocuments } from '@/src/infrastructure/db/projectDocuments'
import type { DocumentType } from '@/src/infrastructure/db/projectDocuments'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)
  const type = url.searchParams.get('type') as DocumentType | null
  const docs = await listDocuments(id, type ?? undefined)
  return NextResponse.json(docs, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  if (!body.title) return NextResponse.json({ error: 'title required' }, { status: 400 })
  if (!body.type) return NextResponse.json({ error: 'type required' }, { status: 400 })
  if (!body.content) return NextResponse.json({ error: 'content required' }, { status: 400 })
  const doc = await createDocument({ projectId: id, ...body })
  return NextResponse.json(doc, { status: 201 })
}
