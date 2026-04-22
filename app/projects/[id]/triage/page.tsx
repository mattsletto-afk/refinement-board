'use client'
import { use, useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

interface Story {
  id: string
  title: string
  userStory: string
  notes: string
  epicId: string | null
  featureId: string | null
  status: string
  rank: number
}

interface Epic { id: string; title: string }
interface Feature { id: string; title: string; epicId: string | null }

const GUIDANCE = {
  epic: {
    label: 'Epic',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
    btn: 'bg-purple-600 hover:bg-purple-700 text-white',
    icon: '◈',
    hint: 'Large theme spanning multiple sprints. Contains features and stories.',
  },
  feature: {
    label: 'Feature',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    btn: 'bg-blue-600 hover:bg-blue-700 text-white',
    icon: '▣',
    hint: 'Shippable slice, 1–4 weeks. Has a clear before/after for the user.',
  },
  story: {
    label: 'User Story',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    btn: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    icon: '◻',
    hint: 'Single testable unit of value. Completable in one sprint.',
  },
}

export default function TriagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params)

  const [stories, setStories] = useState<Story[]>([])
  const [epics, setEpics] = useState<Epic[]>([])
  const [features, setFeatures] = useState<Feature[]>([])
  const [idx, setIdx] = useState(0)
  const [done, setDone] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const [deciding, setDeciding] = useState<'epic' | 'feature' | 'story' | null>(null)
  const [targetEpicId, setTargetEpicId] = useState<string>('')
  const [targetFeatureId, setTargetFeatureId] = useState<string>('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const [storiesRes, epicsRes, featuresRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/stories`),
        fetch(`/api/projects/${projectId}/epics`),
        fetch(`/api/projects/${projectId}/features`),
      ])
      const [storiesData, epicsData, featuresData] = await Promise.all([
        storiesRes.json(),
        epicsRes.json(),
        featuresRes.json(),
      ])
      setStories(storiesData)
      setEpics(epicsData)
      setFeatures(featuresData)
      setLoading(false)
    }
    load()
  }, [projectId])

  const currentStory = stories.filter(s => !done.has(s.id))[idx] ?? null

  const resetForNext = useCallback(() => {
    setDeciding(null)
    setTargetEpicId('')
    setTargetFeatureId('')
  }, [])

  const goNext = useCallback(() => {
    const remaining = stories.filter(s => !done.has(s.id))
    if (idx < remaining.length - 1) {
      setIdx(i => i + 1)
    } else {
      setIdx(0)
    }
    resetForNext()
  }, [idx, stories, done, resetForNext])

  async function applyDecision() {
    if (!deciding || !currentStory) return
    setSaving(true)

    if (deciding === 'epic') {
      await fetch(`/api/projects/${projectId}/epics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: currentStory.title, description: currentStory.userStory || currentStory.notes || '' }),
      })
      await fetch(`/api/stories/${currentStory.id}`, { method: 'DELETE' })
    } else if (deciding === 'feature') {
      await fetch(`/api/projects/${projectId}/features`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: currentStory.title, description: currentStory.userStory || '', epicId: targetEpicId || null }),
      })
      await fetch(`/api/stories/${currentStory.id}`, { method: 'DELETE' })
    } else {
      await fetch(`/api/stories/${currentStory.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epicId: targetEpicId || null, featureId: targetFeatureId || null }),
      })
    }

    const res = await fetch(`/api/projects/${projectId}/stories`)
    const updated = await res.json()
    setStories(updated)
    setDone(d => new Set([...d, currentStory.id]))
    setSaving(false)
    resetForNext()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-gray-400 text-sm">Loading stories…</div>
      </div>
    )
  }

  const remaining = stories.filter(s => !done.has(s.id))
  const totalDone = done.size
  const totalStories = stories.length

  if (remaining.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 gap-4">
        <div className="text-4xl">✓</div>
        <h2 className="text-xl font-semibold text-gray-800">All items triaged!</h2>
        <p className="text-gray-500 text-sm">{totalDone} of {totalStories} items classified</p>
        <Link href={`/projects/${projectId}/board`} className="mt-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
          Back to board →
        </Link>
      </div>
    )
  }

  const story = currentStory!
  const epicTitle = epics.find(e => e.id === story.epicId)?.title
  const featureTitle = features.find(f => f.id === story.featureId)?.title
  const filteredFeatures = targetEpicId ? features.filter(f => f.epicId === targetEpicId) : features

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 shrink-0">
        <Link href={`/projects/${projectId}/board`} className="text-gray-400 hover:text-gray-600 text-sm">← Board</Link>
        <h1 className="font-semibold text-gray-800">Story Triage</h1>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-xs text-gray-500">{totalDone} done · {remaining.length} remaining</div>
          <div className="w-32 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${totalStories > 0 ? (totalDone / totalStories) * 100 : 0}%` }} />
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 justify-center">
        <div className="w-full max-w-xl flex flex-col bg-white border-x border-gray-200">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="text-[10px] font-mono text-gray-400">#{story.rank}</span>
              {(epicTitle || featureTitle) && (
                <div className="text-[10px] text-gray-400 flex items-center gap-1">
                  {epicTitle && <span className="text-purple-500">{epicTitle}</span>}
                  {epicTitle && featureTitle && <span>›</span>}
                  {featureTitle && <span className="text-blue-500">{featureTitle}</span>}
                </div>
              )}
            </div>
            <h2 className="text-base font-semibold text-gray-900 mb-2">{story.title}</h2>
            {story.userStory && <p className="text-sm text-gray-600 leading-relaxed line-clamp-4">{story.userStory}</p>}
            {story.notes && !story.userStory && <p className="text-sm text-gray-400 italic line-clamp-3">{story.notes}</p>}
          </div>

          <div className="px-6 py-4 border-b border-gray-100 space-y-2">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Classify as</p>
            {(Object.entries(GUIDANCE) as [keyof typeof GUIDANCE, typeof GUIDANCE[keyof typeof GUIDANCE]][]).map(([key, g]) => (
              <button key={key}
                onClick={() => { setDeciding(deciding === key ? null : key); setTargetEpicId(''); setTargetFeatureId('') }}
                className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${deciding === key ? g.color + ' border-2' : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{g.icon}</span>
                  <div>
                    <span className="font-medium">{g.label}</span>
                    <span className="ml-2 text-[11px] text-gray-400">{g.hint}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {deciding && (
            <div className="px-6 py-4 border-b border-gray-100 space-y-2">
              {(deciding === 'feature' || deciding === 'story') && (
                <div>
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Parent Epic <span className="font-normal normal-case">(optional)</span></label>
                  <select value={targetEpicId} onChange={e => { setTargetEpicId(e.target.value); setTargetFeatureId('') }}
                    className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                    <option value="">— none —</option>
                    {epics.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
                  </select>
                </div>
              )}
              {deciding === 'story' && (
                <div>
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Parent Feature <span className="font-normal normal-case">(optional)</span></label>
                  <select value={targetFeatureId} onChange={e => setTargetFeatureId(e.target.value)}
                    className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                    <option value="">— none —</option>
                    {filteredFeatures.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
                  </select>
                </div>
              )}
              <button onClick={applyDecision} disabled={saving}
                className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${GUIDANCE[deciding].btn}`}>
                {saving ? 'Saving…' : `Confirm: ${GUIDANCE[deciding].label}`}
              </button>
            </div>
          )}

          <div className="px-6 py-3 mt-auto">
            <button onClick={goNext}
              className="w-full py-1.5 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
              Skip for now →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
