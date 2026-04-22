'use client'

import React from 'react'
import { useState } from 'react'

type ExportFormat = 'markdown' | 'pdf'
type ExportState = 'idle' | 'loading' | 'done' | 'error'

export default function ExportPage(): React.JSX.Element {
  const [markdownState, setMarkdownState] = useState<ExportState>('idle')
  const [pdfState, setPdfState] = useState<ExportState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function triggerDownload(format: ExportFormat): Promise<void> {
    const setState = format === 'markdown' ? setMarkdownState : setPdfState
    setState('loading')
    setErrorMessage(null)

    try {
      const endpoint = format === 'markdown' ? '/api/export/markdown' : '/api/export/pdf'
      const response = await fetch(endpoint)

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`)
      }

      const blob = await response.blob()
      const contentDisposition = response.headers.get('Content-Disposition') ?? ''
      const filenameMatch = contentDisposition.match(/filename="([^"]+)"/)
      const filename = filenameMatch?.[1] ?? `refinement-board.${format === 'markdown' ? 'md' : 'html'}`

      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)

      setState('done')
      setTimeout(() => setState('idle'), 3000)
    } catch (err) {
      setState('error')
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Export Project</h1>
        <p className="text-slate-600 mb-8">
          Download the full project — epics, features, stories, tasks, risks and milestones — as a
          portable document.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ExportCard
            title="Markdown"
            description="Plain text with formatting. Works in GitHub, Notion, Obsidian and any markdown editor."
            extension=".md"
            state={markdownState}
            onClick={() => triggerDownload('markdown')}
            icon="📄"
          />
          <ExportCard
            title="PDF (HTML)"
            description="Styled document ready to print or save as PDF from your browser (File → Print → Save as PDF)."
            extension=".html"
            state={pdfState}
            onClick={() => triggerDownload('pdf')}
            icon="🖨️"
          />
        </div>

        {errorMessage && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="mt-10 rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-800 mb-3">What is included?</h2>
          <ul className="space-y-1 text-sm text-slate-600">
            <li>✅ All epics with status and priority</li>
            <li>✅ Features grouped under their epic</li>
            <li>✅ Stories with status, grouped under features or epics</li>
            <li>✅ Tasks listed under each story</li>
            <li>✅ All risks with status</li>
            <li>✅ All milestones with status</li>
            <li>✅ Stories not linked to any epic or feature</li>
          </ul>
        </div>
      </div>
    </main>
  )
}

interface ExportCardProps {
  title: string
  description: string
  extension: string
  state: ExportState
  onClick: () => void
  icon: string
}

function ExportCard({
  title,
  description,
  extension,
  state,
  onClick,
  icon,
}: ExportCardProps): React.JSX.Element {
  const isLoading = state === 'loading'
  const isDone = state === 'done'

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col gap-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{icon}</span>
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <span className="text-xs text-slate-400 font-mono">{extension}</span>
        </div>
      </div>
      <p className="text-sm text-slate-600 flex-1">{description}</p>
      <button
        onClick={onClick}
        disabled={isLoading}
        className="w-full rounded-lg px-4 py-2 text-sm font-medium transition-colors
          bg-slate-900 text-white hover:bg-slate-700
          disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Generating…' : isDone ? '✓ Downloaded' : `Download ${title}`}
      </button>
    </div>
  )
}
