'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Persona } from '@/src/domain/types'

const PIECES: Record<string, string> = {
  king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙',
}

const COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
  '#ef4444', '#14b8a6', '#f97316', '#84cc16',
]

const ROLE_TYPES = ['contributor', 'lead', 'reviewer', 'observer']

function PersonaCard({
  persona,
  onEdit,
  onDelete,
}: {
  persona: Persona
  onEdit: (p: Persona) => void
  onDelete: (id: string) => void
}) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-xl text-white font-bold flex-shrink-0"
          style={{ backgroundColor: persona.color }}
        >
          {PIECES[persona.chesspiece] ?? '♙'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-semibold text-gray-900 text-sm">{persona.name}</h3>
            {persona.agentType === 'ai-agent' && (
              <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">AI</span>
            )}
            {!persona.enabled && (
              <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">disabled</span>
            )}
          </div>
          <div className="text-xs text-gray-400 capitalize">{persona.roleType}</div>
          {persona.description && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{persona.description}</p>
          )}
          {persona.focusAreas && (
            <p className="text-xs text-indigo-500 mt-1 truncate">{persona.focusAreas}</p>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
        <button onClick={() => onEdit(persona)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
          Edit
        </button>
        {confirming ? (
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-xs text-gray-400">Delete?</span>
            <button onClick={() => onDelete(persona.id)} className="text-xs text-red-500 font-semibold hover:text-red-700">Yes</button>
            <button onClick={() => setConfirming(false)} className="text-xs text-gray-400 hover:text-gray-600">No</button>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)} className="text-xs text-gray-300 hover:text-red-400 ml-auto">
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

function PersonaForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<Persona>
  onSave: (data: Partial<Persona>) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [roleType, setRoleType] = useState(initial?.roleType ?? 'contributor')
  const [chesspiece, setChesspiece] = useState(initial?.chesspiece ?? 'pawn')
  const [color, setColor] = useState(initial?.color ?? '#6366f1')
  const [strengths, setStrengths] = useState(initial?.strengths ?? '')
  const [weaknesses, setWeaknesses] = useState(initial?.weaknesses ?? '')
  const [focusAreas, setFocusAreas] = useState(initial?.focusAreas ?? '')
  const [agentType, setAgentType] = useState<'human' | 'ai-agent'>(initial?.agentType ?? 'human')
  const [model, setModel] = useState(initial?.model ?? '')
  const [enabled, setEnabled] = useState(initial?.enabled ?? true)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    await onSave({ name: name.trim(), description, roleType, chesspiece, color, strengths, weaknesses, focusAreas, agentType, model: model || null, enabled })
    setSaving(false)
  }

  return (
    <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
      <h2 className="text-sm font-semibold text-gray-700">{initial?.id ? 'Edit Persona' : 'New Persona'}</h2>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs font-medium text-gray-500 block mb-1">Name *</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Role</label>
          <select value={roleType} onChange={(e) => setRoleType(e.target.value as Persona['roleType'])} className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            {ROLE_TYPES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Type</label>
          <select value={agentType} onChange={(e) => setAgentType(e.target.value as 'human' | 'ai-agent')} className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="human">Human</option>
            <option value="ai-agent">AI Agent</option>
          </select>
        </div>

        {agentType === 'ai-agent' && (
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-500 block mb-1">Model</label>
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="claude-sonnet-4-6" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        )}
      </div>

      {/* Chess piece */}
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-2">Chess Piece</label>
        <div className="flex gap-2">
          {Object.entries(PIECES).map(([piece, symbol]) => (
            <button
              key={piece}
              type="button"
              onClick={() => setChesspiece(piece as Persona['chesspiece'])}
              className={`w-9 h-9 rounded-md text-xl border-2 transition-colors ${
                chesspiece === piece ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-400'
              }`}
            >
              {symbol}
            </button>
          ))}
        </div>
      </div>

      {/* Color */}
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-2">Color</label>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? 'border-gray-900 scale-110' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-1">Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Strengths</label>
          <textarea value={strengths} onChange={(e) => setStrengths(e.target.value)} rows={2} placeholder="One per line" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Weaknesses</label>
          <textarea value={weaknesses} onChange={(e) => setWeaknesses(e.target.value)} rows={2} placeholder="One per line" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500 block mb-1">Focus Areas</label>
        <input value={focusAreas} onChange={(e) => setFocusAreas(e.target.value)} placeholder="e.g. Salesforce, API design, UX" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="rounded" />
        <span className="text-sm text-gray-600">Enabled</span>
      </label>

      <div className="flex gap-2 pt-2 border-t border-gray-100">
        <button type="submit" disabled={saving || !name.trim()} className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
          {saving ? 'Saving…' : initial?.id ? 'Save Changes' : 'Create Persona'}
        </button>
        <button type="button" onClick={onCancel} className="text-gray-500 px-4 py-2 text-sm hover:text-gray-700">
          Cancel
        </button>
      </div>
    </form>
  )
}

export default function PersonasPage() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Persona | null>(null)

  async function load() {
    const res = await fetch('/api/personas')
    setPersonas(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleCreate(data: Partial<Persona>) {
    await fetch('/api/personas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    await load()
    setCreating(false)
  }

  async function handleUpdate(data: Partial<Persona>) {
    if (!editing) return
    await fetch(`/api/personas/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    await load()
    setEditing(null)
  }

  async function handleDelete(id: string) {
    await fetch(`/api/personas/${id}`, { method: 'DELETE' })
    await load()
  }

  const humans = personas.filter((p) => p.agentType === 'human')
  const agents = personas.filter((p) => p.agentType === 'ai-agent')

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white px-6 py-3 flex items-center gap-4">
        <Link href="/" className="text-slate-400 hover:text-white text-sm">← Projects</Link>
        <span className="font-semibold text-sm">Persona Library</span>
        <div className="flex-1" />
        <button onClick={() => setCreating(true)} className="bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-indigo-700">
          + New Persona
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <p className="text-sm text-gray-500 mb-6">
          Personas are global and persist across all projects. Assign them to a project and workstream from the board.
        </p>

        {(creating || editing) && (
          <div className="mb-6">
            <PersonaForm
              initial={editing ?? undefined}
              onSave={editing ? handleUpdate : handleCreate}
              onCancel={() => { setCreating(false); setEditing(null) }}
            />
          </div>
        )}

        {loading ? (
          <div className="text-sm text-gray-400">Loading…</div>
        ) : personas.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm border border-dashed border-gray-300 rounded-lg bg-white">
            No personas yet. Create your first one.
          </div>
        ) : (
          <>
            {humans.length > 0 && (
              <section className="mb-8">
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Human Personas ({humans.length})</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {humans.map((p) => (
                    <PersonaCard key={p.id} persona={p} onEdit={setEditing} onDelete={handleDelete} />
                  ))}
                </div>
              </section>
            )}
            {agents.length > 0 && (
              <section>
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">AI Agents ({agents.length})</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {agents.map((p) => (
                    <PersonaCard key={p.id} persona={p} onEdit={setEditing} onDelete={handleDelete} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
