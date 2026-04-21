'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { WizardData } from '@/app/api/projects/wizard/generate/route'

// ── Types ──────────────────────────────────────────────────────────────────────

type WizardKey = keyof WizardData
type FieldStatus = 'idle' | 'generating' | 'done'

interface FieldConfig {
  key: WizardKey
  label: string
  hint: string
  multiline: boolean
}

const FIELDS: FieldConfig[] = [
  { key: 'name',        label: 'Project Name',              hint: 'Short, memorable name',                          multiline: false },
  { key: 'description', label: 'Description',               hint: '2-3 sentence scope summary',                     multiline: true  },
  { key: 'techSpecs',   label: 'Technical Specifications',  hint: 'Stack, architecture, key integrations',          multiline: true  },
  { key: 'roles',       label: 'Team Roles',                hint: 'One per line: Title (N) — responsibilities',     multiline: true  },
  { key: 'epics',       label: 'Initial Epics',             hint: 'One per line — high-level work streams',         multiline: true  },
  { key: 'timeline',    label: 'Timeline',                  hint: 'Phases with rough week ranges',                  multiline: true  },
  { key: 'constraints', label: 'Constraints & Assumptions', hint: 'Budget, scope, compliance, team limits',         multiline: true  },
]

const COLORS = [
  { label: 'Indigo',   value: '#6366f1' },
  { label: 'Sky',      value: '#0ea5e9' },
  { label: 'Emerald',  value: '#10b981' },
  { label: 'Amber',    value: '#f59e0b' },
  { label: 'Rose',     value: '#ef4444' },
  { label: 'Violet',   value: '#8b5cf6' },
]

// ── FieldCard ──────────────────────────────────────────────────────────────────

function FieldCard({ config, value, enabled, status, onChange, onToggle, onRegenerate }: {
  config: FieldConfig
  value: string
  enabled: boolean
  status: FieldStatus
  onChange: (v: string) => void
  onToggle: () => void
  onRegenerate: () => void
}) {
  const spinning = status === 'generating'

  return (
    <div className={`border rounded-lg overflow-hidden transition-opacity ${enabled ? 'border-gray-200' : 'border-gray-100 opacity-50'}`}>
      <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 border-b border-gray-100">
        <input type="checkbox" checked={enabled} onChange={onToggle}
          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
        <span className="text-sm font-medium text-gray-800 flex-1">{config.label}</span>
        {value && enabled && (
          <button onClick={onRegenerate} disabled={spinning}
            className="text-xs text-indigo-500 hover:text-indigo-700 disabled:opacity-40 flex items-center gap-1">
            <span className={spinning ? 'animate-spin inline-block' : ''}>↺</span>
            {spinning ? 'Generating…' : 'Regenerate'}
          </button>
        )}
      </div>
      {enabled && (
        <div className="p-3">
          {status === 'generating' && !value ? (
            <div className="text-xs text-gray-400 animate-pulse py-2">Generating…</div>
          ) : config.multiline ? (
            <textarea
              value={value}
              onChange={e => onChange(e.target.value)}
              rows={config.key === 'name' ? 1 : config.key === 'timeline' ? 4 : 5}
              placeholder={config.hint}
              className="w-full text-sm text-gray-800 resize-y border-0 outline-none focus:ring-0 p-0 bg-transparent placeholder-gray-300"
            />
          ) : (
            <input
              value={value}
              onChange={e => onChange(e.target.value)}
              placeholder={config.hint}
              className="w-full text-sm text-gray-800 border-0 outline-none focus:ring-0 p-0 bg-transparent placeholder-gray-300"
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── BlankForm ──────────────────────────────────────────────────────────────────

function BlankForm() {
  const router = useRouter()
  const [name, setName]   = useState('')
  const [desc, setDesc]   = useState('')
  const [color, setColor] = useState('#6366f1')
  const [saving, setSaving] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    const res = await fetch('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), description: desc.trim(), color }),
    })
    const project = await res.json() as { id: string }
    router.push(`/projects/${project.id}/board`)
  }

  return (
    <form onSubmit={handleCreate} className="space-y-4">
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-1">Project Name</label>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Salesforce Knowledge Base"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-1">Description</label>
        <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} placeholder="Optional description"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-2">Color</label>
        <div className="flex gap-2">
          {COLORS.map(c => (
            <button key={c.value} type="button" onClick={() => setColor(c.value)}
              className={`w-7 h-7 rounded-full border-2 transition-transform ${color === c.value ? 'border-gray-800 scale-110' : 'border-transparent'}`}
              style={{ backgroundColor: c.value }} />
          ))}
        </div>
      </div>
      <button type="submit" disabled={saving || !name.trim()}
        className="w-full bg-indigo-600 text-white py-2.5 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
        {saving ? 'Creating…' : 'Create Project'}
      </button>
    </form>
  )
}

// ── WizardForm ─────────────────────────────────────────────────────────────────

function WizardForm() {
  const router = useRouter()
  const [intent, setIntent]   = useState('')
  const [data, setData]       = useState<WizardData>({ name: '', description: '', techSpecs: '', roles: '', epics: '', timeline: '', constraints: '' })
  const [enabled, setEnabled] = useState<Record<WizardKey, boolean>>({ name: true, description: true, techSpecs: true, roles: true, epics: true, timeline: true, constraints: true })
  const [statuses, setStatuses] = useState<Record<WizardKey, FieldStatus>>({ name: 'idle', description: 'idle', techSpecs: 'idle', roles: 'idle', epics: 'idle', timeline: 'idle', constraints: 'idle' })
  const [generating, setGenerating] = useState(false)
  const [color, setColor]     = useState('#6366f1')
  const [creating, setCreating] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const generated = Object.values(data).some(Boolean)

  function setField(key: WizardKey, value: string) {
    setData(prev => ({ ...prev, [key]: value }))
  }

  function setStatus(key: WizardKey, status: FieldStatus) {
    setStatuses(prev => ({ ...prev, [key]: status }))
  }

  async function handleGenerate() {
    if (!intent.trim()) return
    setGenerating(true)
    setError(null)
    FIELDS.forEach(f => setStatus(f.key, 'generating'))
    try {
      const res = await fetch('/api/projects/wizard/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent }),
      })
      const result = await res.json() as WizardData
      setData(result)
      FIELDS.forEach(f => setStatus(f.key, 'done'))
    } catch {
      setError('Generation failed — try again')
      FIELDS.forEach(f => setStatus(f.key, 'idle'))
    } finally {
      setGenerating(false)
    }
  }

  async function handleRegenerate(key: WizardKey) {
    setStatus(key, 'generating')
    try {
      const res = await fetch('/api/projects/wizard/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent, field: key, currentData: data }),
      })
      const result = await res.json() as Partial<WizardData>
      if (result[key] !== undefined) setField(key, result[key] as string)
    } catch { /* leave as-is */ } finally {
      setStatus(key, 'done')
    }
  }

  async function handleCreate() {
    if (!data.name.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/projects/wizard/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, enabled, color }),
      })
      const result = await res.json() as { projectId: string }
      router.push(`/projects/${result.projectId}/board`)
    } catch {
      setError('Failed to create project — try again')
      setCreating(false)
    }
  }

  const canCreate = data.name.trim().length > 0

  return (
    <div className="space-y-5">
      {/* Intent input */}
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-1">Describe your project</label>
        <div className="flex gap-2">
          <textarea
            value={intent} onChange={e => setIntent(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate() }}
            placeholder="e.g. A SaaS platform for restaurant reservation management with online booking, table management, and staff scheduling"
            rows={3}
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>
        <div className="flex items-center gap-2 mt-2">
          <button onClick={handleGenerate} disabled={generating || !intent.trim()}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            <span className={generating ? 'animate-spin inline-block' : ''}>✦</span>
            {generating ? 'Generating…' : generated ? 'Regenerate All' : 'Generate'}
          </button>
          <span className="text-xs text-gray-400">⌘+Enter</span>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

      {/* Fields */}
      {(generated || generating) && (
        <>
          <div className="space-y-3">
            {FIELDS.map(f => (
              <FieldCard key={f.key} config={f}
                value={data[f.key]}
                enabled={enabled[f.key]}
                status={statuses[f.key]}
                onChange={v => setField(f.key, v)}
                onToggle={() => setEnabled(prev => ({ ...prev, [f.key]: !prev[f.key] }))}
                onRegenerate={() => handleRegenerate(f.key)}
              />
            ))}
          </div>

          {/* Color */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-2">Project Color</label>
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button key={c.value} type="button" onClick={() => setColor(c.value)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${color === c.value ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c.value }} />
              ))}
            </div>
          </div>

          <button onClick={handleCreate} disabled={creating || !canCreate}
            className="w-full bg-indigo-600 text-white py-2.5 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {creating ? 'Creating…' : 'Create Project'}
          </button>
        </>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function NewProjectPage() {
  const [mode, setMode] = useState<'blank' | 'wizard'>('blank')

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white px-6 py-3 flex items-center gap-4">
        <Link href="/" className="text-slate-400 hover:text-white text-sm">← Projects</Link>
        <span className="font-semibold text-sm">New Project</span>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        {/* Mode picker */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <button onClick={() => setMode('blank')}
            className={`p-5 rounded-xl border-2 text-left transition-all ${mode === 'blank' ? 'border-indigo-500 bg-white shadow-md' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
            <div className="text-2xl mb-2">📋</div>
            <div className="font-semibold text-gray-900 text-sm">Blank Project</div>
            <div className="text-xs text-gray-500 mt-1">Start with a name and fill it in yourself</div>
          </button>
          <button onClick={() => setMode('wizard')}
            className={`p-5 rounded-xl border-2 text-left transition-all ${mode === 'wizard' ? 'border-indigo-500 bg-white shadow-md' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
            <div className="text-2xl mb-2">✦</div>
            <div className="font-semibold text-gray-900 text-sm">AI Wizard</div>
            <div className="text-xs text-gray-500 mt-1">Describe your idea — AI seeds name, team, epics & more</div>
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          {mode === 'blank' ? <BlankForm /> : <WizardForm />}
        </div>
      </main>
    </div>
  )
}
