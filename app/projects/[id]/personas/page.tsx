'use client'

import { use, useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, useDroppable, useDraggable, closestCorners,
} from '@dnd-kit/core'
import type { Persona, Workstream, PersonaPlacement, Project } from '@/src/domain/types'
import type { Chesspiece } from '@/src/domain/types'
import UserNav from '@/app/components/UserNav'

// ── Types ─────────────────────────────────────────────────────────────────────

type ActiveDrag = { persona: Persona; source: 'palette' | 'board' | 'stream'; placementId?: string }
type ChatMessage = { role: 'user' | 'assistant'; content: string }
type StreamChatTurn = {
  question: string
  replies: { id: string; name: string; piece: string; color: string; agentType: string; reply: string }[]
}

// ── Chess slot definitions ────────────────────────────────────────────────────

interface SlotDef { id: string; piece: Chesspiece; col: number; row: number }

const BACK_RANK: SlotDef[] = [
  { id: 'rook-0',   piece: 'rook',   col: 0, row: 0 },
  { id: 'knight-0', piece: 'knight', col: 1, row: 0 },
  { id: 'bishop-0', piece: 'bishop', col: 2, row: 0 },
  { id: 'queen-0',  piece: 'queen',  col: 3, row: 0 },
  { id: 'king-0',   piece: 'king',   col: 4, row: 0 },
  { id: 'bishop-1', piece: 'bishop', col: 5, row: 0 },
  { id: 'knight-1', piece: 'knight', col: 6, row: 0 },
  { id: 'rook-1',   piece: 'rook',   col: 7, row: 0 },
]
const PAWN_RANK: SlotDef[] = Array.from({ length: 8 }, (_, i) => ({
  id: `pawn-${i}`, piece: 'pawn' as Chesspiece, col: i, row: 1,
}))
const ALL_SLOTS = [...BACK_RANK, ...PAWN_RANK]

const PIECE_CFG: Record<string, { label: string; symbol: string }> = {
  king:   { label: 'King',   symbol: '♚' },
  queen:  { label: 'Queen',  symbol: '♛' },
  rook:   { label: 'Rook',   symbol: '♜' },
  bishop: { label: 'Bishop', symbol: '♝' },
  knight: { label: 'Knight', symbol: '♞' },
  pawn:   { label: 'Pawn',   symbol: '♟' },
}

const HUMAN_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#f97316','#eab308',
  '#22c55e','#14b8a6','#0ea5e9','#64748b','#dc2626',
]

function isLight(col: number, row: number) { return (col + row) % 2 === 0 }

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function mixedRgba(colors: string[], alpha: number): string {
  if (!colors.length) return `rgba(0,0,0,0)`
  const sum = colors.reduce<[number, number, number]>(([ar, ag, ab], hex) => {
    const [r, g, b] = hexToRgb(hex)
    return [ar + r, ag + g, ab + b]
  }, [0, 0, 0])
  const n = colors.length
  return `rgba(${Math.round(sum[0] / n)},${Math.round(sum[1] / n)},${Math.round(sum[2] / n)},${alpha})`
}

// Fiscal week helpers
function getFiscalYearStart(fyYear: number): Date {
  const nov1 = new Date(fyYear, 10, 1)
  const dow = nov1.getDay()
  const add = dow === 1 ? 0 : dow === 0 ? 1 : 8 - dow
  const d = new Date(nov1); d.setDate(d.getDate() + add); return d
}
function currentFYYear() { const t = new Date(); return t.getMonth() >= 10 ? t.getFullYear() : t.getFullYear() - 1 }
function getFiscalWeek(date: Date) { return Math.max(1, Math.min(52, Math.floor((date.getTime() - getFiscalYearStart(currentFYYear()).getTime()) / 6048e5) + 1)) }
function fmtFW(fw: number) { const d = getFiscalYearStart(currentFYYear()); d.setDate(d.getDate() + (fw - 1) * 7); return `FW${fw} ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` }
const CURRENT_FW = getFiscalWeek(new Date())

// ── Stream chat modal ─────────────────────────────────────────────────────────

function StreamChatModal({ projectId, workstream, personas, placements, onClose }: {
  projectId: string; workstream: Workstream; personas: Persona[]; placements: PersonaPlacement[]; onClose: () => void
}) {
  const [history, setHistory] = useState<StreamChatTurn[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const members = placements.map(pl => personas.find(p => p.id === pl.personaId)).filter((p): p is Persona => !!p)
  useEffect(() => { setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60) }, [history, loading])

  async function send() {
    const msg = input.trim(); if (!msg || loading) return
    setInput(''); setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/workstreams/${workstream.id}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history: history.flatMap(t => [{ role: 'user', content: t.question }, { role: 'assistant', content: t.replies.map(r => `${r.name}: ${r.reply}`).join('\n\n') }]) }),
      })
      const data = await res.json() as { replies?: StreamChatTurn['replies'] }
      if (data.replies) setHistory(h => [...h, { question: msg, replies: data.replies! }])
    } catch { setHistory(h => [...h, { question: msg, replies: [{ id: '', name: 'Error', piece: 'pawn', color: '#ef4444', agentType: 'human', reply: 'Server unreachable.' }] }]) }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col z-10" style={{ height: '75vh' }}>
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 flex-shrink-0">
          <div className="flex -space-x-2">
            {members.slice(0, 5).map(p => (
              <span key={p.id} className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-sm" style={{ backgroundColor: p.color + '30', color: p.color }}>
                {PIECE_CFG[p.chesspiece]?.symbol ?? '♟'}
              </span>
            ))}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-800 text-sm">{workstream.name}</p>
            <p className="text-[10px] text-slate-400">{members.map(p => p.name).join(' · ')}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {!history.length && !loading && <p className="text-xs text-slate-400 italic text-center pt-6">Ask the {workstream.name} team anything.</p>}
          {history.map((turn, ti) => (
            <div key={ti} className="space-y-3">
              <div className="flex justify-end"><div className="bg-slate-800 text-white text-sm rounded-2xl rounded-br-sm px-3.5 py-2 max-w-[75%]">{turn.question}</div></div>
              {turn.replies.map((r, ri) => (
                <div key={ri} className="flex items-start gap-2.5">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm mt-0.5" style={{ backgroundColor: (r.color || '#64748b') + '25', color: r.color || '#64748b', borderColor: (r.color || '#64748b') + '40' }}>{PIECE_CFG[r.piece]?.symbol ?? '♟'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold mb-1" style={{ color: r.color || '#64748b' }}>{r.name} {r.agentType === 'ai-agent' && <span className="text-[8px] bg-violet-100 text-violet-600 px-1 rounded font-bold">AI</span>}</p>
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-sm px-3.5 py-2 text-sm text-slate-700 whitespace-pre-wrap">{r.reply}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
          {loading && <div className="flex items-start gap-2.5"><div className="w-7 h-7 rounded-full bg-slate-100" /><div className="bg-slate-50 border rounded-2xl px-3.5 py-2 text-slate-400 text-sm">deliberating…</div></div>}
          <div ref={bottomRef} />
        </div>
        <div className="flex gap-2 px-4 py-3 border-t border-slate-100">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send() }} placeholder={`Ask the ${workstream.name} team…`} className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
          <button onClick={send} disabled={!input.trim() || loading} className="px-4 py-2 bg-slate-800 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 disabled:opacity-40">Send</button>
        </div>
      </div>
    </div>
  )
}

// ── Persona detail modal ───────────────────────────────────────────────────────

function PersonaDetailModal({ persona, projectId, workstreams, placements, onSave, onClose }: {
  persona: Persona; projectId: string; workstreams: Workstream[]; placements: PersonaPlacement[]
  onSave: (updates: Partial<Persona>) => void; onClose: () => void
}) {
  const [name, setName] = useState(persona.name)
  const [description, setDescription] = useState(persona.description)
  const [agentType, setAgentType] = useState<'human' | 'ai-agent'>(persona.agentType)
  const [model, setModel] = useState(persona.model ?? '')
  const [rightTab, setRightTab] = useState<'week' | 'chat'>(persona.agentType === 'ai-agent' ? 'chat' : 'week')
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [viewFW, setViewFW] = useState(CURRENT_FW)
  const [weekStories, setWeekStories] = useState<{ id: string; title: string; status: string }[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  const personaWorkstreams = workstreams.filter(ws => placements.some(pl => pl.personaId === persona.id && pl.workstreamId === ws.id))

  useEffect(() => {
    if (rightTab !== 'week') return
    const wsIds = personaWorkstreams.map(w => w.id); if (!wsIds.length) return
    fetch(`/api/projects/${projectId}/stories`).then(r => r.json()).then((stories: { id: string; title: string; status: string; sprintWeekStart: number | null; sprintWeekEnd: number | null; sprintStream: number | null }[]) => {
      const idx = personaWorkstreams.map(w => workstreams.findIndex(x => x.id === w.id))
      setWeekStories(stories.filter(s => s.sprintWeekStart !== null && s.sprintWeekStart <= viewFW && (s.sprintWeekEnd ?? s.sprintWeekStart) >= viewFW && idx.includes(s.sprintStream ?? -1)))
    })
  }, [rightTab, viewFW, persona.id])

  function save() { if (!name.trim()) return; onSave({ name: name.trim(), description, agentType, model: model.trim() || undefined }); onClose() }

  async function sendChat() {
    const msg = chatInput.trim(); if (!msg || chatLoading) return
    setChatHistory(h => [...h, { role: 'user', content: msg }]); setChatInput(''); setChatLoading(true)
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    try {
      const res = await fetch(`/api/personas/${persona.id}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg, history: chatHistory }) })
      const data = await res.json() as { reply?: string; error?: string }
      setChatHistory(h => [...h, { role: 'assistant', content: data.reply ?? data.error ?? 'No response.' }])
    } catch { setChatHistory(h => [...h, { role: 'assistant', content: 'Error.' }]) }
    finally { setChatLoading(false); setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden z-10">
        <div className="flex items-center gap-3 px-6 py-4 border-b flex-shrink-0" style={{ background: `${persona.color}18`, borderColor: `${persona.color}40` }}>
          <span className="text-4xl leading-none" style={{ color: persona.color }}>{PIECE_CFG[persona.chesspiece]?.symbol ?? '♟'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{PIECE_CFG[persona.chesspiece]?.label ?? persona.chesspiece}{persona.agentType === 'ai-agent' && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-100 text-violet-700 border border-violet-200">🤖 AI Agent</span>}</p>
            <p className="text-base font-semibold text-slate-800 truncate">{persona.name}</p>
            {persona.description && <p className="text-xs text-slate-500 truncate">{persona.description}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none ml-1">×</button>
        </div>
        <div className="flex flex-1 min-h-0">
          <div className="w-60 flex-shrink-0 border-r border-slate-100 flex flex-col overflow-y-auto p-5 space-y-4">
            <div><label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block">Name</label><input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save() }} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" /></div>
            <div><label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block">Description</label><textarea rows={4} value={description} onChange={e => setDescription(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300" /></div>
            <div><label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Type</label><div className="flex rounded-lg overflow-hidden border border-slate-200"><button onClick={() => setAgentType('human')} className={`flex-1 py-1.5 text-xs font-semibold ${agentType === 'human' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>👤 Human</button><button onClick={() => setAgentType('ai-agent')} className={`flex-1 py-1.5 text-xs font-semibold ${agentType === 'ai-agent' ? 'bg-violet-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>🤖 AI</button></div></div>
            {agentType === 'ai-agent' && <div><label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block">Model</label><input value={model} onChange={e => setModel(e.target.value)} placeholder="claude-sonnet-4-6" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>}
            {personaWorkstreams.length > 0 && <div><label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Workstreams</label><div className="flex flex-wrap gap-1.5">{personaWorkstreams.map(ws => <span key={ws.id} className="px-2 py-0.5 rounded-full text-xs font-semibold text-white" style={{ backgroundColor: ws.color }}>{ws.name}</span>)}</div></div>}
            <div className="flex gap-2 pt-1"><button onClick={save} disabled={!name.trim()} className="flex-1 py-2 rounded-lg text-sm font-semibold bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-40">Save</button><button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-500 border border-slate-200 hover:bg-slate-50">Cancel</button></div>
          </div>
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            <div className="flex border-b border-slate-100 flex-shrink-0">
              <button onClick={() => setRightTab('week')} className={`px-4 py-2.5 text-xs font-semibold border-b-2 ${rightTab === 'week' ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Week View</button>
              {persona.agentType === 'ai-agent' && <button onClick={() => setRightTab('chat')} className={`px-4 py-2.5 text-xs font-semibold border-b-2 ${rightTab === 'chat' ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>🤖 Chat</button>}
            </div>
            {rightTab === 'chat' && (
              <div className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {!chatHistory.length && <p className="text-xs text-slate-400 italic text-center pt-6">Ask {persona.name} anything…</p>}
                  {chatHistory.map((msg, i) => <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${msg.role === 'user' ? 'bg-slate-800 text-white rounded-br-sm' : 'bg-violet-50 text-slate-800 border border-violet-100 rounded-bl-sm'}`}>{msg.content}</div></div>)}
                  {chatLoading && <div className="flex justify-start"><div className="bg-violet-50 border border-violet-100 rounded-2xl px-3.5 py-2.5 text-violet-400 text-sm">thinking…</div></div>}
                  <div ref={chatEndRef} />
                </div>
                <div className="flex gap-2 p-3 border-t border-slate-100"><input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }} placeholder={`Ask ${persona.name}…`} className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" /><button onClick={sendChat} disabled={!chatInput.trim() || chatLoading} className="px-3 py-2 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 disabled:opacity-40">Send</button></div>
              </div>
            )}
            {rightTab === 'week' && (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <button onClick={() => setViewFW(w => Math.max(1, w - 1))} className="w-7 h-7 flex items-center justify-center rounded border text-slate-500 hover:bg-slate-100 disabled:opacity-30 text-sm" disabled={viewFW <= 1}>‹</button>
                  <div className="flex-1 text-center text-[11px] font-bold uppercase tracking-widest text-slate-500">{fmtFW(viewFW)}</div>
                  <button onClick={() => setViewFW(w => Math.min(52, w + 1))} className="w-7 h-7 flex items-center justify-center rounded border text-slate-500 hover:bg-slate-100 disabled:opacity-30 text-sm" disabled={viewFW >= 52}>›</button>
                </div>
                {!personaWorkstreams.length ? <p className="text-sm text-slate-400 italic">Not in any workstream.</p> : !weekStories.length ? <p className="text-sm text-slate-400 italic">No stories this week.</p> : weekStories.map(s => <div key={s.id} className="border rounded-lg px-3 py-2 bg-white"><span className="text-sm text-slate-700">{s.title}</span><span className="ml-2 text-xs text-slate-400">{s.status}</span></div>)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Draggable persona card (pool) ─────────────────────────────────────────────

function PersonaCard({ persona, onDetail }: { persona: Persona; onDetail: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette:${persona.id}`, data: { type: 'palette', persona },
  })
  const role = recommendedRoleForPersona(persona)
  const label = AGENT_DEFINITIONS.find(d => d.type === role)?.label ?? role

  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes}
      style={{ transform: transform ? `translate(${transform.x}px,${transform.y}px)` : undefined, opacity: isDragging ? 0.3 : 1, cursor: 'grab' }}
      className="flex items-center gap-3 px-3 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md select-none group"
    >
      <div className="w-9 h-9 rounded-full flex items-center justify-center text-xl shrink-0 border-2"
        style={{ backgroundColor: persona.color + '20', color: persona.color, borderColor: persona.color + '50' }}>
        {PIECE_CFG[persona.chesspiece]?.symbol ?? '♟'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{persona.name}</p>
        {persona.description
          ? <p className="text-[11px] text-slate-400 truncate">{persona.description}</p>
          : persona.agentType === 'ai-agent'
            ? <p className="text-[11px] text-violet-500 truncate">{label}</p>
            : null
        }
      </div>
      {persona.agentType === 'ai-agent' && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-600 border border-violet-200 shrink-0">AI</span>
      )}
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onDetail() }}
        className="shrink-0 w-6 h-6 flex items-center justify-center text-slate-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
      >✎</button>
    </div>
  )
}

// ── Chess slot ────────────────────────────────────────────────────────────────

function ChessSlot({ slot, persona, streamNames, onRemove, onDetail }: {
  slot: SlotDef; persona: Persona | null; streamNames: string[]; onRemove: () => void; onDetail: () => void
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `chess:${slot.id}`, data: { type: 'chess-slot', slot } })
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: `board:${slot.id}`, data: { type: 'board', slot, persona }, disabled: !persona,
  })

  const light = isLight(slot.col, slot.row)
  const squareBg = light ? 'bg-amber-50' : 'bg-amber-100'
  const emptyBorder = light ? 'border-amber-200' : 'border-amber-300'
  const cfg = PIECE_CFG[slot.piece]

  function setRef(el: HTMLElement | null) { setDropRef(el); setDragRef(el) }

  return (
    <div ref={setRef} {...(persona ? { ...listeners, ...attributes } : {})}
      style={persona && transform ? { transform: `translate(${transform.x}px,${transform.y}px)` } : undefined}
      className={[
        'relative flex flex-col items-center justify-between w-[108px] h-[108px] rounded-xl border-2 transition-all select-none',
        persona ? 'cursor-grab' : 'cursor-default',
        isDragging ? 'opacity-30' : '',
        isOver ? 'border-blue-400 ring-2 ring-blue-300 ring-offset-1' : '',
        !isOver && persona ? `border-transparent ${squareBg}` : '',
        !isOver && !persona ? `${squareBg} border-dashed ${emptyBorder}` : '',
      ].join(' ')}
    >
      <div className={`w-full flex items-center justify-between px-2 pt-1.5 ${persona ? 'opacity-40' : 'opacity-60'}`}>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{cfg.label}</span>
        <span className="text-base leading-none text-slate-400">{cfg.symbol}</span>
      </div>
      {persona ? (
        <div className="flex flex-col items-center gap-0.5 pb-1 px-1.5 w-full">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl font-bold border-2 border-white shadow-sm" style={{ backgroundColor: persona.color + '25', color: persona.color, borderColor: persona.color + '60' }}>
            {cfg.symbol}
          </div>
          <span className="text-[10px] font-semibold text-slate-700 text-center leading-tight truncate w-full text-center" title={persona.name}>{persona.name}</span>
          {streamNames.length > 0 && (
            <span className="text-[9px] text-slate-400 truncate w-full text-center">{streamNames.join(', ')}</span>
          )}
          {persona.agentType === 'ai-agent' && (
            <span className="text-[8px] px-1 py-0.5 rounded bg-violet-100 text-violet-600 font-bold leading-none">AI</span>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[10px] text-slate-400 italic">empty</span>
        </div>
      )}
      {persona && (
        <div className="absolute top-0.5 right-0.5 flex gap-0.5">
          <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onDetail() }}
            className="w-4 h-4 flex items-center justify-center text-[9px] text-slate-400 hover:text-blue-500 bg-white/80 rounded opacity-0 group-hover:opacity-100 transition-opacity" title="Details">✎</button>
          <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onRemove() }}
            className="w-4 h-4 flex items-center justify-center text-[9px] text-slate-400 hover:text-red-500 bg-white/80 rounded" title="Remove">✕</button>
        </div>
      )}
    </div>
  )
}

// ── Stream column — vertical member list with description + focus areas ──────

function StreamColumn({ workstream, placements, personas, onChat, onDetail, onRemoveMember, onSave }: {
  workstream: Workstream
  placements: PersonaPlacement[]
  personas: Persona[]
  onChat: () => void
  onDetail: (id: string) => void
  onRemoveMember: (personaId: string) => void
  onSave: (id: string, patch: Partial<Workstream>) => Promise<void>
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `stream:${workstream.id}`, data: { type: 'stream', workstreamId: workstream.id } })
  const members = placements.map(pl => personas.find(p => p.id === pl.personaId)).filter((p): p is Persona => !!p)

  const [editingDesc, setEditingDesc] = useState(false)
  const [descDraft, setDescDraft] = useState(workstream.description ?? '')
  const [newTag, setNewTag] = useState('')
  const [addingTag, setAddingTag] = useState(false)
  const tagInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDescDraft(workstream.description ?? '') }, [workstream.description])
  useEffect(() => { if (addingTag) setTimeout(() => tagInputRef.current?.focus(), 30) }, [addingTag])

  async function saveDesc() {
    setEditingDesc(false)
    if (descDraft !== (workstream.description ?? '')) {
      await onSave(workstream.id, { description: descDraft || null })
    }
  }

  async function addTag() {
    const tag = newTag.trim()
    if (!tag) { setAddingTag(false); return }
    const updated = [...workstream.focusAreas, tag]
    await onSave(workstream.id, { focusAreas: updated })
    setNewTag(''); setAddingTag(false)
  }

  async function removeTag(tag: string) {
    await onSave(workstream.id, { focusAreas: workstream.focusAreas.filter(t => t !== tag) })
  }

  return (
    <div
      ref={setNodeRef}
      className={[
        'flex flex-col rounded-xl border-2 min-w-[210px] w-[230px] flex-shrink-0 transition-all',
        isOver ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200' : '',
      ].join(' ')}
      style={isOver ? {} : { backgroundColor: workstream.color + '0d', borderColor: workstream.color + '50' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: workstream.color + '30' }}>
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: workstream.color }} />
        <span className="text-sm font-semibold text-slate-700 flex-1 truncate">{workstream.name}</span>
        {members.length > 0 && (
          <button onClick={e => { e.stopPropagation(); onChat() }}
            className="text-[13px] text-slate-400 hover:text-slate-600 shrink-0" title="Team chat">💬</button>
        )}
      </div>

      {/* Description */}
      <div className="px-3 pt-2.5 pb-1">
        {editingDesc ? (
          <textarea
            autoFocus
            value={descDraft}
            onChange={e => setDescDraft(e.target.value)}
            onBlur={saveDesc}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveDesc() } if (e.key === 'Escape') { setDescDraft(workstream.description ?? ''); setEditingDesc(false) } }}
            rows={2}
            placeholder="Short summary…"
            className="w-full text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        ) : (
          <p
            onClick={() => setEditingDesc(true)}
            className="text-xs text-slate-500 italic cursor-text hover:text-slate-700 min-h-[1.5rem] leading-relaxed"
          >
            {workstream.description || <span className="text-slate-300">Add a summary…</span>}
          </p>
        )}
      </div>

      {/* Focus area tags */}
      <div className="px-3 pb-2.5 flex flex-wrap gap-1.5 items-center min-h-[28px]">
        {workstream.focusAreas.map(tag => (
          <span key={tag}
            className="group/tag flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border"
            style={{ backgroundColor: workstream.color + '18', borderColor: workstream.color + '40', color: workstream.color }}>
            {tag}
            <button
              onClick={() => removeTag(tag)}
              className="opacity-0 group-hover/tag:opacity-100 transition-opacity text-[10px] leading-none hover:text-red-500"
            >×</button>
          </span>
        ))}
        {addingTag ? (
          <input
            ref={tagInputRef}
            value={newTag}
            onChange={e => setNewTag(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') { setNewTag(''); setAddingTag(false) } }}
            onBlur={() => { if (!newTag.trim()) setAddingTag(false) }}
            placeholder="Focus area…"
            className="text-[11px] border border-slate-300 rounded-full px-2 py-0.5 w-28 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        ) : (
          <button
            onClick={() => setAddingTag(true)}
            className="text-[11px] text-slate-300 hover:text-slate-500 px-1.5 py-0.5 rounded-full border border-dashed border-slate-200 hover:border-slate-400 transition-colors"
          >+ area</button>
        )}
      </div>

      {/* Divider */}
      <div className="border-t mx-3" style={{ borderColor: workstream.color + '30' }} />

      {/* Member list */}
      <div className="flex flex-col gap-0 py-1 min-h-[52px]">
        {members.length === 0 ? (
          <p className="text-[11px] text-slate-400 italic px-3 py-3">
            {isOver ? 'Drop to assign →' : 'Drop a piece here'}
          </p>
        ) : (
          members.map(p => (
            <div key={p.id}
              className="flex items-center gap-2.5 px-3 py-2 hover:bg-black/5 group transition-colors cursor-pointer"
              onClick={() => onDetail(p.id)}
            >
              <span className="text-base leading-none shrink-0 w-5 text-center" style={{ color: p.color }}>
                {PIECE_CFG[p.chesspiece]?.symbol ?? '♟'}
              </span>
              <span className="text-sm text-slate-700 flex-1 truncate font-medium">{p.name}</span>
              {p.agentType === 'ai-agent' && (
                <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-violet-100 text-violet-500 shrink-0">AI</span>
              )}
              <button
                onClick={e => { e.stopPropagation(); onRemoveMember(p.id) }}
                className="text-[11px] text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                title="Remove from stream"
              >✕</button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Drag overlay ──────────────────────────────────────────────────────────────

function OverlayChip({ persona }: { persona: Persona }) {
  return (
    <div style={{ cursor: 'grabbing' }} className="flex items-center gap-2 px-3 py-2 bg-white border-2 border-blue-400 rounded-xl shadow-2xl rotate-2 select-none">
      <span style={{ color: persona.color }} className="text-2xl leading-none">{PIECE_CFG[persona.chesspiece]?.symbol ?? '♟'}</span>
      <span className="text-sm font-semibold text-slate-700">{persona.name}</span>
    </div>
  )
}

// ── Collapsible section header ────────────────────────────────────────────────

function SectionHeader({ label, count, open, onToggle, action }: {
  label: string; count: number; open: boolean; onToggle: () => void; action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-200 bg-slate-50 cursor-pointer select-none" onClick={onToggle}>
      <span className="text-slate-400 text-xs font-mono w-3">{open ? '▾' : '▸'}</span>
      <span className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</span>
      <span className="text-[11px] text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded-full font-semibold">{count}</span>
      <div className="flex-1" />
      {action && <div onClick={e => e.stopPropagation()}>{action}</div>}
    </div>
  )
}

// ── Quick-add human form ──────────────────────────────────────────────────────

function QuickAddHuman({ onAdd }: { onAdd: (name: string, color: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState(HUMAN_COLORS[0])
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50) }, [open])

  async function submit() {
    if (!name.trim() || saving) return
    setSaving(true)
    try { await onAdd(name.trim(), color); setName(''); setOpen(false) }
    finally { setSaving(false) }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 border border-dashed border-slate-300 hover:border-slate-400 px-3 py-2 rounded-xl transition-colors">
        + Add human
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm">
      <div className="flex gap-1 shrink-0">
        {HUMAN_COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)}
            className={`w-4 h-4 rounded-full border-2 transition-transform ${color === c ? 'scale-125 border-white ring-1 ring-slate-400' : 'border-transparent hover:scale-110'}`}
            style={{ backgroundColor: c }} />
        ))}
      </div>
      <input
        ref={inputRef}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false) }}
        placeholder="Full name…"
        className="flex-1 min-w-0 text-sm border-0 outline-none bg-transparent text-slate-800 placeholder-slate-400"
      />
      <button onClick={submit} disabled={!name.trim() || saving}
        className="text-xs px-2.5 py-1 bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-40 shrink-0">
        {saving ? '…' : 'Add'}
      </button>
      <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm shrink-0">✕</button>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PersonasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params)
  const [project, setProject]             = useState<Project | null>(null)
  const [personas, setPersonas]           = useState<Persona[]>([])
  const [workstreams, setWorkstreams]     = useState<Workstream[]>([])
  const [allPlacements, setAllPlacements] = useState<PersonaPlacement[]>([])
  const [loading, setLoading]             = useState(true)
  const [activeDrag, setActiveDrag]       = useState<ActiveDrag | null>(null)
  const [detailPersonaId, setDetailPersonaId] = useState<string | null>(null)
  const [chatWorkstreamId, setChatWorkstreamId] = useState<string | null>(null)
  const [newWsName, setNewWsName]         = useState('')
  const [aiOpen, setAiOpen]               = useState(true)
  const [humansOpen, setHumansOpen]       = useState(true)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const detailPersona  = detailPersonaId ? personas.find(p => p.id === detailPersonaId) ?? null : null
  const chatWorkstream = chatWorkstreamId ? workstreams.find(w => w.id === chatWorkstreamId) ?? null : null

  const boardPlacements = allPlacements.filter(pl => pl.workstreamId === null)
  const streamPlacements: Record<string, PersonaPlacement[]> = {}
  for (const ws of workstreams) streamPlacements[ws.id] = []
  for (const pl of allPlacements) { if (pl.workstreamId && streamPlacements[pl.workstreamId]) streamPlacements[pl.workstreamId].push(pl) }

  const aiPersonas    = personas.filter(p => p.agentType === 'ai-agent')
  const humanPersonas = personas.filter(p => p.agentType === 'human')

  async function reload() {
    const [projRes, pRes, wsRes, plRes] = await Promise.all([
      fetch(`/api/projects/${projectId}`).then(r => r.json()),
      fetch('/api/personas').then(r => r.json()),
      fetch(`/api/projects/${projectId}/workstreams`).then(r => r.json()),
      fetch(`/api/projects/${projectId}/placements`).then(r => r.json()),
    ])
    setProject(projRes); setPersonas(pRes); setWorkstreams(wsRes); setAllPlacements(plRes)
    setLoading(false)
  }
  useEffect(() => { reload() }, [projectId])

  function slotPersona(slot: SlotDef): Persona | null {
    const idx = parseInt(slot.id.split('-')[1])
    const matching = boardPlacements
      .filter(pl => { const p = personas.find(x => x.id === pl.personaId); return p?.chesspiece === slot.piece })
      .sort((a, b) => a.sequence - b.sequence)
    const pl = matching[idx]
    return pl ? personas.find(p => p.id === pl.personaId) ?? null : null
  }

  function streamNamesForPersona(personaId: string): string[] {
    return allPlacements
      .filter(pl => pl.personaId === personaId && pl.workstreamId !== null)
      .map(pl => workstreams.find(ws => ws.id === pl.workstreamId)?.name ?? '')
      .filter(Boolean)
  }

  async function handleDragStart(event: DragStartEvent) {
    const d = event.active.data.current
    if (d?.type === 'palette') setActiveDrag({ persona: d.persona, source: 'palette' })
    else if (d?.type === 'board' && d.persona) setActiveDrag({ persona: d.persona, source: 'board' })
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null)
    const { active, over } = event
    if (!over) return
    const d = active.data.current
    const overId = String(over.id)

    if (overId.startsWith('chess:')) {
      const slotId = overId.slice(6)
      const slot = ALL_SLOTS.find(s => s.id === slotId)
      if (!slot) return
      const persona: Persona = d?.persona
      if (!persona) return
      if (persona.chesspiece !== slot.piece) {
        await fetch(`/api/personas/${persona.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chesspiece: slot.piece }),
        })
      }
      const existing = allPlacements.find(pl => pl.personaId === persona.id && pl.workstreamId === null)
      if (!existing) {
        await fetch(`/api/projects/${projectId}/placements`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ personaId: persona.id, workstreamId: null }),
        })
      }
      await reload(); return
    }

    if (overId.startsWith('stream:')) {
      const wsId = overId.slice(7)
      const persona: Persona = d?.persona
      if (!persona) return
      await fetch(`/api/projects/${projectId}/placements`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId: persona.id, workstreamId: wsId }),
      })
      await reload(); return
    }
  }

  async function handleRemoveFromBoard(personaId: string) {
    const pl = boardPlacements.find(p => p.personaId === personaId)
    if (!pl) return
    await fetch(`/api/projects/${projectId}/placements/${pl.id}`, { method: 'DELETE' })
    await reload()
  }

  async function handleRemoveFromStream(personaId: string, wsId: string) {
    const pl = allPlacements.find(p => p.personaId === personaId && p.workstreamId === wsId)
    if (!pl) return
    await fetch(`/api/projects/${projectId}/placements/${pl.id}`, { method: 'DELETE' })
    await reload()
  }

  async function handleAddWorkstream() {
    const name = newWsName.trim(); if (!name) return
    await fetch(`/api/projects/${projectId}/workstreams`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    setNewWsName(''); await reload()
  }

  async function handleSavePersona(id: string, updates: Partial<Persona>) {
    await fetch(`/api/personas/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) })
    await reload()
  }

  async function handleSaveWorkstream(id: string, patch: Partial<Workstream>) {
    await fetch(`/api/projects/${projectId}/workstreams/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    await reload()
  }

  async function handleAddHuman(name: string, color: string) {
    await fetch('/api/personas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color, agentType: 'human', chesspiece: 'pawn', description: '' }),
    })
    await reload()
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Loading…</div>

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 text-white px-6 py-3 flex items-center gap-4 shrink-0">
        <Link href="/" className="text-slate-400 hover:text-white text-sm">← Projects</Link>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: project?.color }} />
          <span className="font-semibold text-sm">{project?.name}</span>
        </div>
        <nav className="flex items-center gap-1 ml-2">
          <Link href={`/projects/${projectId}/board`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10">Board</Link>
          <span className="px-3 py-1 rounded text-sm font-medium bg-white/10">Team</span>
          <Link href={`/projects/${projectId}/sprint`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10">Sprint</Link>
          <Link href={`/projects/${projectId}/simulate`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10">Simulate</Link>
          <Link href={`/projects/${projectId}/archive`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10">Archive</Link>
          <Link href={`/projects/${projectId}/critical-path`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10">Critical Path</Link>
        </nav>
              <UserNav />
      </header>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex-1 overflow-y-auto">

          {/* ── Workstreams ─────────────────────────────────────────────────── */}
          <section className="bg-white border-b border-slate-200 px-6 py-4">
            <div className="flex items-center gap-3 mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Workstreams</p>
              <p className="text-[10px] text-slate-400">— drag team members from below onto a stream</p>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1 items-start">
              {workstreams.map(ws => (
                <StreamColumn
                  key={ws.id}
                  workstream={ws}
                  placements={streamPlacements[ws.id] ?? []}
                  personas={personas}
                  onChat={() => setChatWorkstreamId(ws.id)}
                  onDetail={setDetailPersonaId}
                  onRemoveMember={pid => handleRemoveFromStream(pid, ws.id)}
                  onSave={handleSaveWorkstream}
                />
              ))}
              <div className="flex items-center gap-2 shrink-0 self-start pt-1">
                <input value={newWsName} onChange={e => setNewWsName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddWorkstream()}
                  placeholder="+ New stream…"
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 w-32"
                />
                {newWsName.trim() && (
                  <button onClick={handleAddWorkstream} className="text-xs px-2 py-1.5 bg-slate-800 text-white rounded-lg hover:bg-slate-700">Add</button>
                )}
              </div>
            </div>
          </section>

          {/* ── Chess board ─────────────────────────────────────────────────── */}
          <section className="px-6 py-6 max-w-[1000px] mx-auto w-full">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Chess Team</h2>
              <span className="text-xs text-slate-400">{boardPlacements.length} of 16 slots filled · drag team members from below to assign roles</span>
            </div>

            <div className="mb-1">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2 pl-1">Back Rank — Main Pieces</p>
              <div className="flex gap-2 flex-wrap">
                {BACK_RANK.map(slot => {
                  const p = slotPersona(slot)
                  return (
                    <ChessSlot key={slot.id} slot={slot} persona={p}
                      streamNames={p ? streamNamesForPersona(p.id) : []}
                      onRemove={() => p && handleRemoveFromBoard(p.id)}
                      onDetail={() => p && setDetailPersonaId(p.id)} />
                  )
                })}
              </div>
            </div>

            <div className="mt-4">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2 pl-1">Pawn Rank — Contributors</p>
              <div className="flex gap-2 flex-wrap">
                {PAWN_RANK.map(slot => {
                  const p = slotPersona(slot)
                  return (
                    <ChessSlot key={slot.id} slot={slot} persona={p}
                      streamNames={p ? streamNamesForPersona(p.id) : []}
                      onRemove={() => p && handleRemoveFromBoard(p.id)}
                      onDetail={() => p && setDetailPersonaId(p.id)} />
                  )
                })}
              </div>
            </div>
          </section>

          {/* ── Persona pool ─────────────────────────────────────────────────── */}
          <section className="border-t border-slate-200 bg-white">

            {/* AI Personas */}
            <SectionHeader
              label="AI Personas"
              count={aiPersonas.length}
              open={aiOpen}
              onToggle={() => setAiOpen(o => !o)}
            />
            {aiOpen && (
              <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {aiPersonas.length === 0
                  ? <p className="col-span-full text-sm text-slate-400 italic">No AI personas — <Link href="/personas" className="text-blue-500 hover:underline">create some</Link></p>
                  : aiPersonas.map(p => <PersonaCard key={p.id} persona={p} onDetail={() => setDetailPersonaId(p.id)} />)
                }
              </div>
            )}

            {/* Humans */}
            <div className="border-t border-slate-100">
              <SectionHeader
                label="Humans"
                count={humanPersonas.length}
                open={humansOpen}
                onToggle={() => setHumansOpen(o => !o)}
              />
              {humansOpen && (
                <div className="px-6 py-4 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {humanPersonas.map(p => <PersonaCard key={p.id} persona={p} onDetail={() => setDetailPersonaId(p.id)} />)}
                  </div>
                  <QuickAddHuman onAdd={handleAddHuman} />
                </div>
              )}
            </div>

          </section>
        </div>

        <DragOverlay>
          {activeDrag ? <OverlayChip persona={activeDrag.persona} /> : null}
        </DragOverlay>
      </DndContext>

      {detailPersona && (
        <PersonaDetailModal
          persona={detailPersona}
          projectId={projectId}
          workstreams={workstreams}
          placements={allPlacements}
          onSave={updates => handleSavePersona(detailPersona.id, updates)}
          onClose={() => setDetailPersonaId(null)}
        />
      )}

      {chatWorkstream && (
        <StreamChatModal
          projectId={projectId}
          workstream={chatWorkstream}
          personas={personas}
          placements={streamPlacements[chatWorkstream.id] ?? []}
          onClose={() => setChatWorkstreamId(null)}
        />
      )}
    </div>
  )
}
