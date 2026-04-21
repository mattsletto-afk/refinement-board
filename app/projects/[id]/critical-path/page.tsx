'use client'

import { use, useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import type { UserStory } from '@/src/domain/types'

interface Dep { id: string; sourceId: string; targetId: string }

// ── Layout algorithm ───────────────────────────────────────────────────────────

function assignLevels(ids: string[], depsById: Record<string, string[]>): Map<string, number> {
  const levels = new Map<string, number>()
  const idSet = new Set(ids)

  function getLevel(id: string): number {
    if (levels.has(id)) return levels.get(id)!
    const blockers = (depsById[id] ?? []).filter(b => idSet.has(b))
    const level = blockers.length === 0 ? 0 : Math.max(...blockers.map(getLevel)) + 1
    levels.set(id, level)
    return level
  }

  ids.forEach(id => getLevel(id))
  return levels
}

// ── Node + edge types ─────────────────────────────────────────────────────────

interface Node {
  id: string
  rank: number
  title: string
  status: string
  priority: string
  estimate: number | null
  notes: string
  level: number
  col: number
  x: number
  y: number
  width: number
  height: number
}

interface Edge { from: Node; to: Node }

// ── Constants ─────────────────────────────────────────────────────────────────

const NODE_W = 200
const NODE_H = 72
const COL_GAP = 120
const ROW_GAP = 20
const PAD_X = 40
const PAD_Y = 40

// ── Status styling ────────────────────────────────────────────────────────────

function statusStyle(node: Node, nodeMap: Map<string, Node>, depsById: Record<string, string[]>) {
  if (node.status === 'done')   return { border: '#16a34a', bg: '#f0fdf4',  badge: 'bg-green-100 text-green-700',   text: 'Done' }
  if (node.status === 'active') return { border: '#10b981', bg: '#ecfdf5',  badge: 'bg-emerald-100 text-emerald-700', text: 'Active' }
  const blockers = depsById[node.id] ?? []
  const hasUnresolved = blockers.some(bid => nodeMap.get(bid)?.status !== 'done')
  if (hasUnresolved) return { border: '#d97706', bg: '#fffbeb', badge: 'bg-amber-100 text-amber-700', text: 'Blocked' }
  return { border: '#4f46e5', bg: '#eef2ff', badge: 'bg-indigo-100 text-indigo-700', text: 'Ready now' }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CriticalPathPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params)
  const [nodes, setNodes] = useState<Node[]>([])
  const [nodeMap, setNodeMap] = useState<Map<string, Node>>(new Map())
  const [depsById, setDepsById] = useState<Record<string, string[]>>({})
  const [edges, setEdges] = useState<Edge[]>([])
  const [svgSize, setSvgSize] = useState({ w: 800, h: 600 })
  const [hovered, setHovered] = useState<string | null>(null)
  const [selected, setSelected] = useState<Node | null>(null)
  const [committedOnly, setCommittedOnly] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const buildGraph = useCallback((stories: UserStory[], deps: Dep[]) => {
    // Build deps map: storyId → [blocking storyIds]
    const byId: Record<string, string[]> = {}
    for (const dep of deps) {
      if (!byId[dep.sourceId]) byId[dep.sourceId] = []
      byId[dep.sourceId].push(dep.targetId)
    }
    setDepsById(byId)

    const ids = stories.map(s => s.id)
    const idToStory = new Map(stories.map(s => [s.id, s]))
    const levels = assignLevels(ids, byId)

    const byLevel = new Map<number, string[]>()
    for (const [id, level] of levels) {
      if (!byLevel.has(level)) byLevel.set(level, [])
      byLevel.get(level)!.push(id)
    }
    for (const arr of byLevel.values()) arr.sort((a, b) => (idToStory.get(a)?.rank ?? 0) - (idToStory.get(b)?.rank ?? 0))

    const maxLevel = levels.size > 0 ? Math.max(...levels.values()) : 0
    const maxRows = byLevel.size > 0 ? Math.max(...[...byLevel.values()].map(a => a.length)) : 1

    setSvgSize({
      w: PAD_X * 2 + (maxLevel + 1) * NODE_W + maxLevel * COL_GAP,
      h: Math.max(PAD_Y * 2 + maxRows * NODE_H + (maxRows - 1) * ROW_GAP, 400),
    })

    const nMap = new Map<string, Node>()
    for (const [level, idArr] of byLevel) {
      idArr.forEach((id, rowIdx) => {
        const story = idToStory.get(id)
        if (!story) return
        nMap.set(id, {
          id,
          rank: story.rank,
          title: story.title,
          status: story.status,
          priority: story.priority,
          estimate: story.estimate ?? null,
          notes: story.notes ?? '',
          level,
          col: rowIdx,
          x: PAD_X + level * (NODE_W + COL_GAP),
          y: PAD_Y + rowIdx * (NODE_H + ROW_GAP),
          width: NODE_W,
          height: NODE_H,
        })
      })
    }

    setNodeMap(nMap)
    setNodes([...nMap.values()])

    const builtEdges: Edge[] = []
    for (const [sourceId, targetIds] of Object.entries(byId)) {
      const to = nMap.get(sourceId)
      if (!to) continue
      for (const tid of targetIds) {
        const from = nMap.get(tid)
        if (from) builtEdges.push({ from, to })
      }
    }
    setEdges(builtEdges)
  }, [])

  const load = useCallback(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}/stories`, { cache: 'no-store' }).then(r => r.json()) as Promise<UserStory[]>,
      fetch(`/api/projects/${projectId}/dependencies`, { cache: 'no-store' }).then(r => r.json()) as Promise<Dep[]>,
    ]).then(([all, deps]) => {
      const scoped = committedOnly
        ? all.filter(s => (s as UserStory & { committed?: boolean }).committed && s.rank > 0)
        : all.filter(s => s.inScope && s.rank > 0)
      // Only keep deps where both ends are in the visible set
      const visibleIds = new Set(scoped.map(s => s.id))
      const visibleDeps = deps.filter(d => visibleIds.has(d.sourceId) && visibleIds.has(d.targetId))
      buildGraph(scoped, visibleDeps)
    }).catch(() => {})
  }, [projectId, buildGraph, committedOnly])

  useEffect(() => {
    load()
    const interval = setInterval(load, 15_000)
    return () => clearInterval(interval)
  }, [load])

  function edgePath(e: Edge): string {
    const x1 = e.from.x + e.from.width
    const y1 = e.from.y + e.from.height / 2
    const x2 = e.to.x
    const y2 = e.to.y + e.to.height / 2
    const cx = (x1 + x2) / 2
    return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`
  }

  const active   = nodes.filter(n => n.status === 'active').length
  const readyNow = nodes.filter(n => n.status !== 'done' && n.status !== 'active' && statusStyle(n, nodeMap, depsById).text === 'Ready now').length
  const blocked  = nodes.filter(n => n.status !== 'done' && statusStyle(n, nodeMap, depsById).text === 'Blocked').length
  const done     = nodes.filter(n => n.status === 'done').length
  const totalPts = nodes.reduce((s, n) => s + (n.estimate ?? 0), 0)
  const donePts  = nodes.filter(n => n.status === 'done').reduce((s, n) => s + (n.estimate ?? 0), 0)
  const hasDeps  = edges.length > 0

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-700 px-6 py-3 flex items-center gap-4 flex-shrink-0">
        <Link href="/" className="text-slate-400 hover:text-white text-sm">← Projects</Link>
        <nav className="flex items-center gap-1 ml-2">
          <Link href={`/projects/${projectId}/board`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors">Board</Link>
          <Link href={`/projects/${projectId}/personas`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors">Team</Link>
          <Link href={`/projects/${projectId}/sprint`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors">Sprint</Link>
                    <Link href={`/projects/${projectId}/archive`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors">Archive</Link>
          <span className="px-3 py-1 rounded text-sm font-medium bg-white/10">Critical Path</span>
          <Link href={`/projects/${projectId}/documents`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors">Docs</Link>
        </nav>
        <div className="flex-1" />
        <button
          onClick={() => setCommittedOnly(v => !v)}
          className={`text-xs border px-3 py-1 rounded transition-colors mr-2 ${committedOnly ? 'bg-emerald-900/60 border-emerald-600 text-emerald-300 font-medium' : 'text-slate-500 hover:text-slate-300 border-slate-700 hover:border-slate-500'}`}
        >
          {committedOnly ? '✓ Committed only' : '○ All in-scope'}
        </button>
        <button onClick={load} className="text-xs text-slate-500 hover:text-slate-300 border border-slate-700 hover:border-slate-500 px-2 py-1 rounded transition-colors mr-2" title="Refresh">↺</button>
        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-slate-400">
          {active > 0 && <span className="flex items-center gap-1.5 text-emerald-400 font-medium"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />{active} active</span>}
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />{readyNow} ready</span>
          {blocked > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />{blocked} blocked</span>}
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />{done} done</span>
          <span className="text-slate-500">{donePts}/{totalPts} pts</span>
        </div>
      </header>

      {/* No-dep hint */}
      {!hasDeps && nodes.length > 0 && (
        <div className="bg-slate-800 border-b border-slate-700 px-6 py-2 text-xs text-slate-400 flex items-center gap-2">
          <span className="text-amber-400">ℹ</span>
          No dependencies defined — all stories show as independent. Open a story on the board and add "Blocked by" links to build the sequence.
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Graph canvas */}
        <div ref={scrollRef} className="flex-1 overflow-auto bg-slate-950 p-0">
          {nodes.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
              No in-scope stories with rank &gt; 0. Mark stories as in-scope on the board.
            </div>
          ) : (
            <svg width={svgSize.w} height={svgSize.h} className="block" style={{ minWidth: svgSize.w, minHeight: svgSize.h }}>
              <defs>
                <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="0.8" fill="#1e293b" />
                </pattern>
                <marker id="arrow-normal" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#475569" />
                </marker>
                <marker id="arrow-hover" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#818cf8" />
                </marker>
                <style>{`
                  @keyframes pulse-ring { 0% { opacity: 0.8; r: 4px; } 70% { opacity: 0; r: 10px; } 100% { opacity: 0; r: 10px; } }
                  @keyframes pulse-ring-outer { 0% { opacity: 0.4; } 50% { opacity: 0.15; } 100% { opacity: 0.4; } }
                  .active-ring { animation: pulse-ring 1.8s ease-out infinite; }
                  .active-glow { animation: pulse-ring-outer 1.8s ease-in-out infinite; }
                `}</style>
              </defs>
              <rect width={svgSize.w} height={svgSize.h} fill="url(#grid)" />

              {/* Column labels */}
              {(() => {
                const usedLevels = new Set(nodes.map(n => n.level))
                return [...usedLevels].sort().map(level => {
                  const label = level === 0 ? 'No blockers' : `Depends on level ${level - 1}`
                  const allDone = nodes.filter(n => n.level === level).every(n => n.status === 'done')
                  const x = PAD_X + level * (NODE_W + COL_GAP) + NODE_W / 2
                  return (
                    <text key={level} x={x} y={18} textAnchor="middle" style={{ fill: allDone ? '#16a34a' : '#475569', fontSize: 11, fontFamily: 'monospace' }}>
                      {allDone ? `✓ ${label}` : label}
                    </text>
                  )
                })
              })()}

              {/* Edges */}
              {edges.map((e, i) => {
                const isHov = hovered === e.from.id || hovered === e.to.id
                const isSel = selected?.id === e.from.id || selected?.id === e.to.id
                const color = isHov || isSel ? '#818cf8' : '#334155'
                const marker = isHov || isSel ? 'url(#arrow-hover)' : 'url(#arrow-normal)'
                const opacity = selected && !isSel && !isHov ? 0.15 : 1
                return (
                  <path key={i} d={edgePath(e)} fill="none" stroke={color} strokeWidth={1.5}
                    strokeDasharray="5,3" markerEnd={marker} opacity={opacity}
                    style={{ transition: 'opacity 0.15s, stroke 0.15s' }} />
                )
              })}

              {/* Nodes */}
              {nodes.map(node => {
                const style = statusStyle(node, nodeMap, depsById)
                const isHov = hovered === node.id
                const isSel = selected?.id === node.id
                const dimmed = selected && !isSel && !edges.some(e => (selected.id === e.from.id && e.to.id === node.id) || (selected.id === e.to.id && e.from.id === node.id))

                return (
                  <g key={node.id} transform={`translate(${node.x}, ${node.y})`}
                    style={{ cursor: 'pointer', opacity: dimmed ? 0.25 : 1, transition: 'opacity 0.15s' }}
                    onMouseEnter={() => setHovered(node.id)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => setSelected(s => s?.id === node.id ? null : node)}
                  >
                    {node.status === 'active' && (
                      <>
                        <rect width={NODE_W} height={NODE_H} rx={8} fill="#10b981" className="active-glow" opacity={0.15} />
                        <rect x={-3} y={-3} width={NODE_W + 6} height={NODE_H + 6} rx={10} fill="none" stroke="#10b981" strokeWidth={2} className="active-ring" />
                      </>
                    )}
                    <rect width={NODE_W} height={NODE_H} rx={8} fill={style.bg}
                      stroke={isSel ? '#818cf8' : style.border} strokeWidth={isSel ? 2 : 1}
                      style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.3))' }} />

                    {/* Rank badge */}
                    <rect x={0} y={0} width={28} height={NODE_H} rx={8} fill={style.border} opacity={0.15} />
                    <rect x={14} y={0} width={14} height={NODE_H} fill={style.border} opacity={0.15} />
                    <text x={14} y={NODE_H / 2 + 5} textAnchor="middle"
                      style={{ fill: '#374151', fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>
                      {node.rank}
                    </text>

                    {/* Title */}
                    <foreignObject x={34} y={8} width={NODE_W - 42} height={NODE_H - 16}>
                      <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: 11, lineHeight: 1.35, color: '#111827', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>
                        {node.title}
                      </div>
                    </foreignObject>

                    {node.estimate && (
                      <text x={NODE_W - 6} y={NODE_H - 6} textAnchor="end" style={{ fill: '#6b7280', fontSize: 10, fontFamily: 'monospace' }}>{node.estimate}pt</text>
                    )}

                    <circle cx={NODE_W - 8} cy={10} r={4} fill={
                      node.status === 'done' ? '#16a34a' :
                      node.status === 'active' ? '#10b981' :
                      style.text === 'Blocked' ? '#d97706' : '#4f46e5'
                    } />
                    {node.status === 'active' && <circle cx={NODE_W - 8} cy={10} r={4} fill="#10b981" className="active-ring" />}
                  </g>
                )
              })}
            </svg>
          )}
        </div>

        {/* Detail panel */}
        <div className={`bg-slate-900 border-l border-slate-700 flex-shrink-0 overflow-auto ${selected ? 'w-80' : 'w-0'}`} style={{ transition: 'width 0.2s ease' }}>
          {selected && (() => {
            const style = statusStyle(selected, nodeMap, depsById)
            const blockedBy = (depsById[selected.id] ?? []).map(id => nodeMap.get(id)).filter(Boolean) as Node[]
            const blocks = nodes.filter(n => (depsById[n.id] ?? []).includes(selected.id))
            return (
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono bg-slate-700 text-slate-300 px-2 py-0.5 rounded">Rank #{selected.rank}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${style.badge}`}>{style.text}</span>
                    </div>
                    <div className="text-xs text-slate-500">{selected.estimate ? `${selected.estimate}pt · ` : ''}{selected.priority} · {selected.status}</div>
                  </div>
                  <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white text-lg leading-none mt-0.5">×</button>
                </div>

                <h3 className="text-sm font-semibold text-white leading-snug mb-4">{selected.title}</h3>

                {blockedBy.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Blocked by</div>
                    {blockedBy.map(n => (
                      <div key={n.id} className="text-xs text-amber-400 mb-1 flex items-center gap-1.5">
                        <span className="font-mono bg-amber-900/30 px-1.5 py-0.5 rounded">#{n.rank}</span>
                        <span className="text-slate-400 truncate">{n.title.slice(0, 45)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {blocks.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Blocks</div>
                    {blocks.map(n => (
                      <div key={n.id} className="text-xs text-indigo-400 mb-1 flex items-center gap-1.5">
                        <span className="font-mono bg-indigo-900/30 px-1.5 py-0.5 rounded">#{n.rank}</span>
                        <span className="text-slate-400 truncate">{n.title.slice(0, 45)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {selected.notes && (
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Notes</div>
                    <p className="text-xs text-slate-300 leading-relaxed">{selected.notes}</p>
                  </div>
                )}

                <div className="mt-5 pt-4 border-t border-slate-700">
                  <Link href={`/projects/${projectId}/board`} className="text-xs text-indigo-400 hover:text-indigo-300">
                    → Open in Board ↗
                  </Link>
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Legend */}
      <footer className="bg-slate-900 border-t border-slate-700 px-6 py-2 flex items-center gap-6 text-xs text-slate-500 flex-shrink-0">
        <span className="flex items-center gap-2"><svg width="32" height="8"><line x1="0" y1="4" x2="32" y2="4" stroke="#475569" strokeWidth="1.5" strokeDasharray="5,3" /></svg> Dependency</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-50 border-2 border-emerald-500 inline-block animate-pulse" /> Active</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-indigo-100 border border-indigo-500 inline-block" /> Ready now</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-50 border border-amber-400 inline-block" /> Blocked</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-50 border border-green-500 inline-block" /> Done</span>
        <span className="ml-auto">Add "Blocked by" links on the board to build the sequence · Click any node to inspect</span>
      </footer>
    </div>
  )
}
