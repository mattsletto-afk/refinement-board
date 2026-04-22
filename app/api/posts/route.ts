import { NextResponse } from 'next/server'
import { prisma } from '@/src/infrastructure/db/client'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  const posts = await prisma.post.findMany({
    where: projectId ? { projectId } : {},
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json(posts)
}

export async function POST(req: Request) {
  const body = await req.json()
  if (!body.title) return NextResponse.json({ error: 'title required' }, { status: 400 })
  const post = await prisma.post.create({
    data: {
      title: body.title,
      content: body.content ?? '',
      type: body.type ?? 'changelog',
      pinned: body.pinned ?? false,
      projectId: body.projectId ?? null,
    },
  })
  return NextResponse.json(post, { status: 201 })
}
