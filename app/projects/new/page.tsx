'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const COLORS = [
  { label: 'Indigo',   value: '#6366f1' },
  { label: 'Sky',      value: '#0ea5e9' },
  { label: 'Emerald',  value: '#10b981' },
  { label: 'Amber',    value: '#f59e0b' },
  { label: 'Rose',     value: '#ef4444' },
  { label: 'Violet',   value: '#8b5cf6' },
]

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

export default function NewProjectPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white px-6 py-3 flex items-center gap-4">
        <Link href="/" className="text-slate-400 hover:text-white text-sm">← Projects</Link>
        <span className="font-semibold text-sm">New Project</span>
      </header>
      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <BlankForm />
        </div>
      </main>
    </div>
  )
}
