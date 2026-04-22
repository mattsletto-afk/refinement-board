import { NextResponse } from 'next/server'
import { getDocument } from '@/src/infrastructure/db/projectDocuments'

export async function GET(_: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { docId } = await params
  const doc = await getDocument(docId)
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(doc)
}
