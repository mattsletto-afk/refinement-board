'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdrGenerateForm() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [context, setContext] = useState('')
  const [optionsRaw, setOptionsRaw] = useState('')
  const [driversRaw, setDriversRaw] = useState('')
  const [storyId, setStoryId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const optionsConsidered = optionsRaw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    const decisionDrivers = driversRaw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)

    if (optionsConsidered.length < 2) {
      setError('Provide at least two options considered (one per line).')
      setSubmitting(false)
      return
    }
    if (decisionDrivers.length < 1) {
      setError('Provide at least one decision driver.')
      setSubmitting(false)
      return
    }

    try {
      const res = await fetch('/api/adrs/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          context,
          optionsConsidered,
          decisionDrivers,
          storyId: storyId.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const data: unknown = await res.json()
        const msg =
          typeof data === 'object' &&
          data !== null &&
          'error' in data &&
          typeof (data as Record<string, unknown>).error === 'string'
            ? (data as Record<string, string>).error
            : 'Failed to generate ADR'
        setError(msg)
        return
      }

      const adr: { id: string } = await res.json()
      router.push(`/adrs/${adr.id}`)
    } catch {
      setError('Unexpected error generating ADR')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Title
        </label>
        <input
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. ADR-006: State Management Strategy"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Context
        </label>
        <textarea
          required
          rows={4}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Describe the situation and forces at play that require a decision..."
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Options Considered{' '}
          <span className="text-gray-400 font-normal">(one per line, min 2)</span>
        </label>
        <textarea
          required
          rows={3}
          value={optionsRaw}
          onChange={(e) => setOptionsRaw(e.target.value)}
          placeholder={`Option A\nOption B\nOption C`}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Decision Drivers{' '}
          <span className="text-gray-400 font-normal">(one per line)</span>
        </label>
        <textarea
          required
          rows={3}
          value={driversRaw}
          onChange={(e) => setDriversRaw(e.target.value)}
          placeholder={`Performance\nSecurity\nMaintainability`}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Story ID{' '}
          <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={storyId}
          onChange={(e) => setStoryId(e.target.value)}
          placeholder="Link to a board story..."
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Generating…' : 'Generate ADR'}
        </button>
        <a
          href="/adrs"
          className="px-5 py-2 border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Cancel
        </a>
      </div>
    </form>
  )
}
