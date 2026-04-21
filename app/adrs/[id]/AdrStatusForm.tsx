'use client'

import { useState } from 'react'
import type { AdrStatus } from '@/src/domain/adr/types'

const STATUS_OPTIONS: AdrStatus[] = [
  'proposed',
  'accepted',
  'superseded',
  'deprecated',
]

function badgeClass(status: string): string {
  switch (status) {
    case 'accepted':
      return 'bg-green-100 text-green-800'
    case 'superseded':
      return 'bg-gray-100 text-gray-600'
    case 'deprecated':
      return 'bg-red-100 text-red-700'
    default:
      return 'bg-yellow-100 text-yellow-800'
  }
}

type Props = {
  adrId: string
  currentStatus: string
}

export default function AdrStatusForm({ adrId, currentStatus }: Props) {
  const [status, setStatus] = useState(currentStatus)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleChange(newStatus: string) {
    if (newStatus === status) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/adrs/${adrId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        throw new Error('Failed to update status')
      }
      setStatus(newStatus)
    } catch {
      setError('Could not update status')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeClass(status)}`}
        >
          {status}
        </span>
        <select
          value={status}
          onChange={(e) => handleChange(e.target.value)}
          disabled={saving}
          className="text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-700 disabled:opacity-50"
          aria-label="Update ADR status"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
