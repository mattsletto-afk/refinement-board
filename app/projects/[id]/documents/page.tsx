'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'

type DocumentType = 'spec' | 'adr' | 'runbook' | 'report' | 'changelog' | 'artifact'

interface ProjectDocument {
  id: string
  title: string
  type: DocumentType
  content: string
  storyId?: string
  agentRunId?: string
  generatedBy?: string
  createdAt: string
}

const TYPE_LABELS: Record<DocumentType, string> = {
  spec:      'Spec',
  adr:       'ADR',
  runbook:   'Runbook',
  report:    'Report',
  changelog: 'Changelog',
  artifact:  'Artifact',
}

const TYPE_COLORS: Record<DocumentType, string> = {
  spec:      'bg-indigo-900/50 text-indigo-300',
  adr:       'bg-amber-900/50 text-amber-300',
  runbook:   'bg-teal-900/50 text-teal-300',
  report:    'bg-purple-900/50 text-purple-300',
  changelog: 'bg-emerald-900/50 text-emerald-300',
  artifact:  'bg-slate-700 text-slate-300',
}

const ALL_TYPES: DocumentType[] = ['spec', 'adr', 'runbook', 'report', 'changelog', 'artifact']

export default function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params)
  const [docs, setDocs] = useState<ProjectDocument[]>([])
  const [selected, setSelected] = useState<ProjectDocument | null>(null)
  const [typeFilter, setTypeFilter] = useState<DocumentType | null>(null)
  const [loading, setLoading] = useState(true)

  async function load(type?: DocumentType | null) {
    setLoading(true)
    const url = `/api/projects/${projectId}/documents${type ? `?type=${type}` : ''}`
    const res = await fetch(url, { cache: 'no-store' })
    if (res.ok) setDocs(await res.json())
    setLoading(false)
  }

  useEffect(() => { load(typeFilter) }, [typeFilter])

  const visible = docs

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      <header className="bg-slate-900 border-b border-slate-700 px-6 py-3 flex items-center gap-4 flex-shrink-0">
        <Link href="/" className="text-slate-400 hover:text-white text-sm">← Projects</Link>
        <nav className="flex items-center gap-1 ml-2">
          <Link href={`/projects/${projectId}/board`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10">Board</Link>
          <Link href={`/projects/${projectId}/critical-path`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10">Critical Path</Link>
                              <span className="px-3 py-1 rounded text-sm font-medium bg-white/10">Docs</span>
        </nav>
        <div className="flex-1" />
        <button onClick={() => load(typeFilter)} className="text-xs border border-slate-700 hover:border-slate-500 px-2 py-1 rounded text-slate-400 hover:text-white">↺</button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 border-r border-slate-700 flex flex-col flex-shrink-0 overflow-y-auto">
          <div className="px-4 py-3 border-b border-slate-700">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Filter by type</div>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setTypeFilter(null)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${typeFilter === null ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                All
              </button>
              {ALL_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${typeFilter === t ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="px-4 py-6 text-sm text-slate-500">Loading…</div>
          ) : visible.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-500">
              No documents yet.{' '}
              {typeFilter === null && 'Spec documents are auto-generated when the loop commits a story.'}
            </div>
          ) : (
            <ul className="py-2">
              {visible.map(doc => (
                <li key={doc.id}>
                  <button
                    onClick={() => setSelected(doc)}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-800 transition-colors border-b border-slate-800 ${selected?.id === doc.id ? 'bg-slate-800' : ''}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${TYPE_COLORS[doc.type as DocumentType]}`}>
                        {TYPE_LABELS[doc.type as DocumentType]}
                      </span>
                    </div>
                    <div className="text-sm text-slate-200 leading-snug line-clamp-2">{doc.title}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {new Date(doc.createdAt).toLocaleDateString()} {new Date(doc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Content pane */}
        <main className="flex-1 overflow-y-auto p-8">
          {selected ? (
            <article className="max-w-3xl mx-auto">
              <div className="flex items-center gap-3 mb-6">
                <span className={`text-xs font-semibold px-2 py-1 rounded uppercase tracking-wide ${TYPE_COLORS[selected.type as DocumentType]}`}>
                  {TYPE_LABELS[selected.type as DocumentType]}
                </span>
                <span className="text-xs text-slate-500">
                  {new Date(selected.createdAt).toLocaleString()}
                </span>
                {selected.generatedBy && (
                  <span className="text-xs text-slate-600 font-mono">{selected.generatedBy}</span>
                )}
              </div>
              <MarkdownContent content={selected.content} />
            </article>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center text-slate-500">
              <div className="text-4xl mb-4">📄</div>
              <div className="text-sm">{visible.length > 0 ? 'Select a document to read' : 'Documents appear here after stories are committed'}</div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-2xl font-bold text-white mb-4 mt-6 first:mt-0">{line.slice(2)}</h1>)
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-lg font-semibold text-white mb-3 mt-6 border-b border-slate-700 pb-1">{line.slice(3)}</h2>)
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-base font-semibold text-slate-200 mb-2 mt-4">{line.slice(4)}</h3>)
    } else if (line.startsWith('- ')) {
      elements.push(<li key={i} className="text-sm text-slate-300 ml-4 list-disc mb-1">{renderInline(line.slice(2))}</li>)
    } else if (line.startsWith('**') && line.endsWith('**')) {
      elements.push(<p key={i} className="text-sm font-semibold text-slate-200 mb-1">{line.slice(2, -2)}</p>)
    } else if (line.startsWith('---')) {
      elements.push(<hr key={i} className="border-slate-700 my-6" />)
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />)
    } else {
      elements.push(<p key={i} className="text-sm text-slate-300 mb-1 leading-relaxed">{renderInline(line)}</p>)
    }
  }

  return <div>{elements}</div>
}

function renderInline(text: string): React.ReactNode {
  // Simple inline code rendering: `code`
  const parts = text.split(/(`[^`]+`)/)
  return parts.map((part, i) =>
    part.startsWith('`') && part.endsWith('`')
      ? <code key={i} className="font-mono text-xs bg-slate-800 text-emerald-300 px-1 py-0.5 rounded">{part.slice(1, -1)}</code>
      : part
  )
}
