import { NextResponse } from 'next/server'
import { prisma } from '@/src/infrastructure/db/client'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const post = await prisma.post.update({ where: { id }, data: body })
  return NextResponse.json(post)
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.post.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
