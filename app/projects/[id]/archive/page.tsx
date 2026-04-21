'use client'
import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { parseSnapshot } from '@/src/domain/archive'
import type { ProjectSnapshot, ProjectExport, UserStory } from '@/src/domain/types'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function ArchivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params)
  const [snapshots, setSnapshots] = useState<ProjectSnapshot[]>([])
  const [selected, setSelected] = useState<ProjectSnapshot | null>(null)
  const [parsed, setParsed] = useState<ProjectExport | null>(null)
  const [loading, setLoading] = useState(true)
  const [storyFilter, setStoryFilter] = useState('')
  const [restoring, setRestoring] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/projects/${projectId}/snapshots`)
      .then((r) => r.json())
      .then(setSnapshots)
      .finally(() => setLoading(false))
  }, [projectId])

  function selectSnapshot(snap: ProjectSnapshot) {
    setSelected(snap)
    setParsed(parseSnapshot(snap))
    setStoryFilter('')
  }

  async function restoreStory(story: UserStory) {
    setRestoring(story.id)
    await fetch(`/api/projects/${projectId}/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: story.title,
        userStory: story.userStory,
        businessProblem: story.businessProblem,
        notes: story.notes,
        board: story.board,
        priority: story.priority,
        valueScore: story.valueScore,
        riskScore: story.riskScore,
        urgencyScore: story.urgencyScore,
        effortScore: story.effortScore,
        meetingPoints: story.meetingPoints,
        requesterGroup: story.requesterGroup,
        tags: story.tags,
      }),
    })
    setRestoring(null)
  }

  const filteredStories = parsed?.userStories.filter(
    (s) => !storyFilter || s.title.toLowerCase().includes(storyFilter.toLowerCase())
  ) ?? []

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-slate-900 text-white px-6 py-3 flex items-center gap-4">
        <Link href="/" className="text-slate-400 hover:text-white text-sm">← Projects</Link>
        <nav className="flex items-center gap-1 ml-2">
          <Link href={`/projects/${projectId}/board`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors">Board</Link>
          <Link href={`/projects/${projectId}/personas`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors">Team</Link>
          <Link href={`/projects/${projectId}/sprint`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors">Sprint</Link>
                    <span className="px-3 py-1 rounded text-sm font-medium bg-white/10">Archive</span>
        </nav>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Snapshot list */}
        <div className="w-72 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700">Snapshots</h2>
            <p className="text-xs text-gray-400 mt-0.5">Read-only point-in-time archives</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="text-xs text-gray-400 p-4">Loading…</div>
            ) : snapshots.length === 0 ? (
              <div className="text-xs text-gray-400 p-4 text-center">
                No snapshots yet. Use "Start Fresh" on the board to create one.
              </div>
            ) : (
              snapshots.map((snap) => (
                <button
                  key={snap.id}
                  onClick={() => selectSnapshot(snap)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                    selected?.id === snap.id ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''
                  }`}
                >
                  <div className="text-sm font-medium text-gray-800 truncate">{snap.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{fmtDate(snap.createdAt)}</div>
                  {snap.description && (
                    <div className="text-xs text-gray-400 mt-0.5 truncate">{snap.description}</div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Snapshot content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              Select a snapshot to browse its contents
            </div>
          ) : !parsed ? (
            <div className="flex-1 flex items-center justify-center text-red-400 text-sm">
              Could not parse snapshot data
            </div>
          ) : (
            <>
              {/* Snapshot header */}
              <div className="px-6 py-4 bg-white border-b border-gray-200">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">{selected.name}</h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Captured {fmtDate(selected.createdAt)} · {parsed.userStories.length} stories · read-only
                    </p>
                  </div>
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">
                    🔒 Immutable
                  </span>
                </div>

                {/* Summary stats */}
                <div className="flex gap-6 mt-3 text-xs text-gray-500">
                  <span>{parsed.epics.length} epics</span>
                  <span>{parsed.features.length} features</span>
                  <span>{parsed.userStories.length} stories</span>
                  <span>{parsed.tasks.length} tasks</span>
                  <span>{parsed.risks.length} risks</span>
                  <span>{parsed.milestones.length} milestones</span>
                </div>
              </div>

              {/* Stories browser */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="flex items-center gap-3 mb-4">
                  <h3 className="text-sm font-semibold text-gray-700">User Stories</h3>
                  <input
                    value={storyFilter}
                    onChange={(e) => setStoryFilter(e.target.value)}
                    placeholder="Filter by title…"
                    className="border border-gray-300 rounded-md px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 w-56"
                  />
                  <span className="text-xs text-gray-400">{filteredStories.length} shown</span>
                </div>

                <div className="space-y-2">
                  {filteredStories.map((story) => (
                    <div key={story.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                            {story.finalScore}
                          </span>
                          <span className="text-sm font-medium text-gray-900 truncate">{story.title}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            story.inScope ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                          }`}>
                            {story.inScope ? 'in scope' : 'out'}
                          </span>
                        </div>
                        {story.userStory && (
                          <p className="text-xs text-gray-500 truncate">{story.userStory}</p>
                        )}
                        <div className="flex gap-3 mt-1 text-xs text-gray-400">
                          <span>{story.board}</span>
                          {story.category && <span>{story.category.name}</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => restoreStory(story)}
                        disabled={restoring === story.id}
                        className="flex-shrink-0 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                      >
                        {restoring === story.id ? 'Restoring…' : 'Restore →'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
