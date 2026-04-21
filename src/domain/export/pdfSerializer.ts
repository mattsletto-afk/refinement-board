import type { ProjectExportData } from './markdownSerializer'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function statusPill(status: string): string {
  const colorMap: Record<string, string> = {
    done: '#22c55e',
    active: '#3b82f6',
    backlog: '#94a3b8',
    open: '#f59e0b',
    closed: '#6b7280',
    critical: '#ef4444',
    high: '#f97316',
    medium: '#eab308',
    low: '#22c55e',
    upcoming: '#8b5cf6',
    completed: '#22c55e',
  }
  const color = colorMap[status.toLowerCase()] ?? '#94a3b8'
  return `<span style="background:${color};color:#fff;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:600">${escapeHtml(status)}</span>`
}

export function serializeToHtml(data: ProjectExportData): string {
  const sections: string[] = []

  if (data.milestones.length > 0) {
    const items = data.milestones
      .map(m => `<li><strong>${escapeHtml(m.title)}</strong> ${statusPill(m.status)}</li>`)
      .join('\n')
    sections.push(`<h2>Milestones</h2><ul>${items}</ul>`)
  }

  if (data.epics.length > 0) {
    sections.push('<h2>Epics &amp; Features</h2>')
    for (const epic of data.epics) {
      sections.push(
        `<h3>${escapeHtml(epic.title)}</h3>` +
        `<p>${statusPill(epic.status)} ${statusPill(epic.priority)}</p>`
      )
      for (const feature of epic.features) {
        sections.push(`<h4>${escapeHtml(feature.title)}</h4>`)
        for (const story of feature.stories) {
          sections.push(
            `<h5>${escapeHtml(story.title)}</h5>` +
            `<p>Status: ${statusPill(story.status)}</p>`
          )
          if (story.tasks.length > 0) {
            const taskItems = story.tasks
              .map(t => `<li>${escapeHtml(t.title)}</li>`)
              .join('\n')
            sections.push(`<ul>${taskItems}</ul>`)
          }
        }
      }
      for (const story of epic.stories) {
        sections.push(
          `<h4>${escapeHtml(story.title)}</h4>` +
          `<p>Status: ${statusPill(story.status)}</p>`
        )
        if (story.tasks.length > 0) {
          const taskItems = story.tasks
            .map(t => `<li>${escapeHtml(t.title)}</li>`)
            .join('\n')
          sections.push(`<ul>${taskItems}</ul>`)
        }
      }
    }
  }

  if (data.orphanStories.length > 0) {
    sections.push('<h2>Stories (No Epic)</h2>')
    for (const story of data.orphanStories) {
      sections.push(
        `<h3>${escapeHtml(story.title)}</h3>` +
        `<p>Status: ${statusPill(story.status)}</p>`
      )
      if (story.tasks.length > 0) {
        const taskItems = story.tasks
          .map(t => `<li>${escapeHtml(t.title)}</li>`)
          .join('\n')
        sections.push(`<ul>${taskItems}</ul>`)
      }
    }
  }

  if (data.risks.length > 0) {
    const items = data.risks
      .map(r => `<li><strong>${escapeHtml(r.title)}</strong> ${statusPill(r.status)}</li>`)
      .join('\n')
    sections.push(`<h2>Risks</h2><ul>${items}</ul>`)
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(data.projectName)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #1e293b; padding: 40px; line-height: 1.6; }
  h1 { font-size: 28px; margin-bottom: 4px; color: #0f172a; }
  h2 { font-size: 20px; margin: 28px 0 10px; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; }
  h3 { font-size: 16px; margin: 20px 0 6px; color: #1e293b; }
  h4 { font-size: 14px; margin: 14px 0 4px; color: #334155; }
  h5 { font-size: 13px; margin: 10px 0 2px; color: #475569; }
  p { margin: 4px 0 8px; }
  ul { margin: 4px 0 8px 20px; }
  li { margin: 2px 0; }
  .subtitle { color: #64748b; font-size: 13px; margin-bottom: 24px; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 20px 0; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
<h1>${escapeHtml(data.projectName)}</h1>
<p class="subtitle">Exported on ${formatDate(data.exportedAt)}</p>
<hr />
${sections.join('\n')}
</body>
</html>`
}
