'use client'

import { useEffect, useState, useCallback } from 'react'
import type { RunScoreEvent } from '@/src/domain/scoring/scoreEventTypes'

function EfficiencyBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, Math.round(score * 100)))
  return (
    <div className="w-full bg-gray-200 rounded h-2">
      <div
        className="bg-blue-500 h-2 rounded"
        style={{ width: `${pct}%` }}
        aria-label={`Efficiency ${pct}%`}
      />
    </div>
  )
}

function ScoreRow({ score }: { score: RunScoreEvent }) {
  return (
    <tr className="border-b">
      <td className="py-2 px-3 font-mono text-xs text-gray-500">{score.runId.slice(-8)}</td>
      <td className="py-2 px-3 text-center">{score.itemsCreated}</td>
      <td className="py-2 px-3 text-center">{score.itemsReworked}</td>
      <td className="py-2 px-3 text-center">
        <span
          className={`px-2 py-0.5 rounded text-xs font-semibold ${
            score.sprintShipped
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-800'
          }`}
        >
          {score.sprintShipped ? 'Yes' : 'No'}
        </span>
      </td>
      <td className="py-2 px-3">
        <div className="flex items-center gap-2">
          <span className="text-sm w-10 text-right">
            {(score.efficiencyScore * 100).toFixed(0)}%
          </span>
          <EfficiencyBar score={score.efficiencyScore} />
        </div>
      </td>
      <td className="py-2 px-3 text-xs text-gray-400">
        {new Date(score.timestamp).toLocaleString()}
      </td>
    </tr>
  )
}

export function KpiDashboard() {
  const [scores, setScores] = useState<RunScoreEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchInitial = useCallback(async () => {
    const res = await fetch('/api/kpi/scores?limit=10')
    if (!res.ok) return
    const data = await res.json() as { scores: RunScoreEvent[] }
    setScores(data.scores)
  }, [])

  useEffect(() => {
    fetchInitial()
  }, [fetchInitial])

  useEffect(() => {
    const es = new EventSource('/api/kpi/scores/stream')

    es.onopen = () => setConnected(true)

    es.onmessage = (evt) => {
      const event = JSON.parse(evt.data) as RunScoreEvent
      setScores((prev) => {
        const updated = [event, ...prev.filter((s) => s.runId !== event.runId)]
        return updated.slice(0, 10)
      })
      setLastUpdated(new Date())
    }

    es.onerror = () => setConnected(false)

    return () => es.close()
  }, [])

  const avgEfficiency =
    scores.length > 0
      ? scores.reduce((sum, s) => sum + s.efficiencyScore, 0) / scores.length
      : null

  const totalCreated = scores.reduce((sum, s) => sum + s.itemsCreated, 0)
  const totalReworked = scores.reduce((sum, s) => sum + s.itemsReworked, 0)
  const shippedCount = scores.filter((s) => s.sprintShipped).length

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            connected ? 'bg-green-400' : 'bg-gray-300'
          }`}
        />
        <span className="text-gray-500">
          {connected ? 'Live' : 'Connecting…'}
        </span>
        {lastUpdated && (
          <span className="text-gray-400 ml-2">
            Last updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded p-4">
          <div className="text-xs text-gray-500 uppercase mb-1">Items Created</div>
          <div className="text-2xl font-bold">{totalCreated}</div>
          <div className="text-xs text-gray-400">last {scores.length} runs</div>
        </div>
        <div className="bg-white border rounded p-4">
          <div className="text-xs text-gray-500 uppercase mb-1">Items Reworked</div>
          <div className="text-2xl font-bold">{totalReworked}</div>
          <div className="text-xs text-gray-400">last {scores.length} runs</div>
        </div>
        <div className="bg-white border rounded p-4">
          <div className="text-xs text-gray-500 uppercase mb-1">Sprints Shipped</div>
          <div className="text-2xl font-bold">
            {shippedCount}/{scores.length}
          </div>
          <div className="text-xs text-gray-400">last {scores.length} runs</div>
        </div>
        <div className="bg-white border rounded p-4">
          <div className="text-xs text-gray-500 uppercase mb-1">Avg Efficiency</div>
          <div className="text-2xl font-bold">
            {avgEfficiency !== null
              ? `${(avgEfficiency * 100).toFixed(0)}%`
              : '—'}
          </div>
          <div className="text-xs text-gray-400">last {scores.length} runs</div>
        </div>
      </div>

      <div className="bg-white border rounded">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold">Run History (last 10)</h2>
        </div>
        {scores.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No scored runs yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="py-2 px-3 text-xs text-gray-500 font-medium">Run</th>
                  <th className="py-2 px-3 text-xs text-gray-500 font-medium text-center">Created</th>
                  <th className="py-2 px-3 text-xs text-gray-500 font-medium text-center">Reworked</th>
                  <th className="py-2 px-3 text-xs text-gray-500 font-medium text-center">Shipped</th>
                  <th className="py-2 px-3 text-xs text-gray-500 font-medium">Efficiency</th>
                  <th className="py-2 px-3 text-xs text-gray-500 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((score) => (
                  <ScoreRow key={score.runId} score={score} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
