import { NextResponse } from 'next/server'
import { loadProjectExportData } from '@/src/infrastructure/export/projectDataLoader'
import { serializeToMarkdown } from '@/src/domain/export/markdownSerializer'

export async function GET(): Promise<NextResponse> {
  const data = await loadProjectExportData('Refinement Board')
  const markdown = serializeToMarkdown(data)

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="refinement-board-${data.exportedAt.toISOString().split('T')[0]}.md"`,
    },
  })
}
