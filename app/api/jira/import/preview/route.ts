import { NextRequest, NextResponse } from 'next/server'
import { parseJiraXmlString } from '@/src/domain/jira-import'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const formData = await request.formData().catch(() => null)
  if (!formData) {
    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }

  const text = await (file as File).text()
  const result = await parseJiraXmlString(text)

  return NextResponse.json({
    epics: result.issues.filter(i => i.issueType === 'Epic').length,
    stories: result.issues.filter(i => i.issueType !== 'Epic').length,
    sprints: result.sprints.length,
    users: result.users.length,
    issueLinks: result.issueLinks.length,
    parseErrors: result.parseErrors.length,
  })
}
