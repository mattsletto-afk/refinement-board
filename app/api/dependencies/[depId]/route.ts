import { NextResponse } from 'next/server'
import { prisma } from '@/src/infrastructure/db/client'

export async function DELETE(_: Request, { params }: { params: Promise<{ depId: string }> }) {
  const { depId } = await params
  await prisma.dependency.delete({ where: { id: depId } })
  return new NextResponse(null, { status: 204 })
}
