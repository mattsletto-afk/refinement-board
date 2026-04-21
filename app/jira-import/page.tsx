'use client'

import React from 'react'
import { useState, useRef } from 'react'

type ConflictStrategy = 'skip' | 'overwrite' | 'merge'
type WizardStep = 'upload' | 'preview' | 'confirm' | 'importing' | 'done' | 'error'

interface PreviewCounts {
  epics: number
  stories: number
  sprints: number
  users: number
  issueLinks: number
  parseErrors: number
}

interface ImportResult {
  epicsCreated: number
  epicsSkipped: number
  storiesCreated: number
  storiesSkipped: number
  dependenciesImported: number
  sprintMembershipsImported: number
  errors: string[]
}

export default function JiraImportPage(): React.JSX.Element {
  const [step, setStep] = useState<WizardStep>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [strategy, setStrategy] = useState<ConflictStrategy>('skip')
  const [preview, setPreview] = useState<PreviewCounts | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleUpload(): Promise<void> {
    if (!file) return
    setError(null)
    setStep('preview')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/jira/import/preview', { method: 'POST', body: formData })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error((body as { error?: string }).error ?? res.statusText)
      }
      const data = await res.json() as PreviewCounts
      setPreview(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed')
      setStep('error')
    }
  }

  async function handleImport(): Promise<void> {
    if (!file) return
    setStep('importing')
    setProgress([])

    const formData = new FormData()
    formData.append('file', file)
    formData.append('strategy', strategy)

    try {
      const res = await fetch('/api/jira/import/stream', { method: 'POST', body: formData })
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error((body as { error?: string }).error ?? res.statusText)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let importResult: ImportResult | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed) continue
          if (trimmed.startsWith('data:')) {
            const json = trimmed.slice(5).trim()
            try {
              const event = JSON.parse(json) as { type: string; message?: string; result?: ImportResult }
              if (event.type === 'progress' && event.message) {
                setProgress(prev => [...prev, event.message!])
              } else if (event.type === 'done' && event.result) {
                importResult = event.result
              } else if (event.type === 'error') {
                throw new Error(event.message ?? 'Import error')
              }
            } catch {
              // skip malformed SSE lines
            }
          }
        }
      }

      if (importResult) {
        setResult(importResult)
        setStep('done')
      } else {
        // Fallback: non-streaming import
        const res2 = await fetch('/api/jira/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ strategy, epics: [], stories: [] }),
        })
        const data = await res2.json() as ImportResult
        setResult(data)
        setStep('done')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
      setStep('error')
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">Jira Import</h1>
      <p className="text-gray-500 mb-8 text-sm">Upload a Jira XML backup to import epics, stories, sprints, and dependencies.</p>

      {step === 'upload' && (
        <div className="space-y-6">
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault()
              const f = e.dataTransfer.files[0]
              if (f) setFile(f)
            }}
          >
            <input ref={fileRef} type="file" accept=".xml,.zip" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            {file ? (
              <div>
                <p className="font-medium text-gray-800">{file.name}</p>
                <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
            ) : (
              <div>
                <p className="text-gray-500">Drop your Jira XML backup here, or click to browse</p>
                <p className="text-xs text-gray-400 mt-1">Supports .xml and .zip exports</p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Conflict strategy</label>
            <div className="space-y-2">
              {(['skip', 'overwrite', 'merge'] as const).map(s => (
                <label key={s} className="flex items-start gap-3 cursor-pointer">
                  <input type="radio" name="strategy" value={s} checked={strategy === s} onChange={() => setStrategy(s)} className="mt-0.5" />
                  <div>
                    <p className="font-medium text-sm capitalize">{s}</p>
                    <p className="text-xs text-gray-500">
                      {s === 'skip' && 'Existing items by Jira key (PROJ-123) are left unchanged'}
                      {s === 'overwrite' && 'Existing items are replaced with imported data'}
                      {s === 'merge' && 'Merge imported fields into existing items, preserving local changes'}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <button
            disabled={!file}
            onClick={handleUpload}
            className="w-full py-2.5 px-4 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
          >
            Preview import
          </button>
        </div>
      )}

      {step === 'preview' && !preview && (
        <div className="text-center py-12 text-gray-500">Parsing file...</div>
      )}

      {step === 'preview' && preview && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold">Preview</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Epics', count: preview.epics },
              { label: 'Stories', count: preview.stories },
              { label: 'Sprints', count: preview.sprints },
              { label: 'Users', count: preview.users },
              { label: 'Issue links', count: preview.issueLinks },
              { label: 'Parse errors', count: preview.parseErrors, warn: preview.parseErrors > 0 },
            ].map(({ label, count, warn }) => (
              <div key={label} className={`p-4 rounded-lg border ${warn ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-gray-50'}`}>
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-sm text-gray-600">{label}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-500">Conflict strategy: <strong>{strategy}</strong></p>
          <div className="flex gap-3">
            <button onClick={() => setStep('upload')} className="flex-1 py-2.5 px-4 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors">
              Back
            </button>
            <button onClick={handleImport} className="flex-1 py-2.5 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
              Start import
            </button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Importing...</h2>
          <div className="bg-gray-50 rounded-lg p-4 h-48 overflow-y-auto font-mono text-xs space-y-1">
            {progress.length === 0 ? (
              <p className="text-gray-400">Starting import...</p>
            ) : (
              progress.map((msg, i) => <p key={i} className="text-gray-700">{msg}</p>)
            )}
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-bold">✓</div>
            <h2 className="text-lg font-semibold">Import complete</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Epics created', count: result.epicsCreated },
              { label: 'Epics skipped', count: result.epicsSkipped },
              { label: 'Stories created', count: result.storiesCreated },
              { label: 'Stories skipped', count: result.storiesSkipped },
              { label: 'Dependencies', count: result.dependenciesImported },
              { label: 'Sprint memberships', count: result.sprintMembershipsImported },
            ].map(({ label, count }) => (
              <div key={label} className="p-4 rounded-lg border border-gray-200 bg-gray-50">
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-sm text-gray-600">{label}</p>
              </div>
            ))}
          </div>
          {result.errors.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm font-medium text-yellow-800 mb-2">{result.errors.length} warning(s)</p>
              <ul className="text-xs text-yellow-700 space-y-1">
                {result.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                {result.errors.length > 10 && <li>...and {result.errors.length - 10} more</li>}
              </ul>
            </div>
          )}
          <button onClick={() => { setStep('upload'); setFile(null); setPreview(null); setResult(null) }} className="w-full py-2.5 px-4 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors">
            Import another file
          </button>
        </div>
      )}

      {step === 'error' && (
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 font-medium">Import failed</p>
            <p className="text-red-700 text-sm mt-1">{error}</p>
          </div>
          <button onClick={() => { setStep('upload'); setError(null) }} className="w-full py-2.5 px-4 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
