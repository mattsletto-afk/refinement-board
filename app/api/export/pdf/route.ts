import { NextResponse } from 'next/server'
import { loadProjectExportData } from '@/src/infrastructure/export/projectDataLoader'
import { serializeToHtml } from '@/src/domain/export/pdfSerializer'

export async function GET(): Promise<NextResponse> {
  const data = await loadProjectExportData('Refinement Board')
  const html = serializeToHtml(data)

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="refinement-board-${data.exportedAt.toISOString().split('T')[0]}.html"`,
    },
  })
}
