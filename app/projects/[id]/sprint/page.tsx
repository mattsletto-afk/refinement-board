'use client'

import { use, useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import type { UserStory, CalendarEvent, Workstream, Project } from '@/src/domain/types'
import UserNav from '@/app/components/UserNav'

// ── Fiscal week utilities ──────────────────────────────────────────────────────

function getFiscalYearStart(fyYear: number): Date {
  const nov1 = new Date(fyYear, 10, 1)
  const dow = nov1.getDay()
  const add = dow === 1 ? 0 : dow === 0 ? 1 : 8 - dow
  const d = new Date(nov1)
  d.setDate(d.getDate() + add)
  return d
}
function currentFYYear(): number {
  const t = new Date()
  return t.getMonth() >= 10 ? t.getFullYear() : t.getFullYear() - 1
}
function getFiscalWeek(date: Date): number {
  const diff = date.getTime() - getFiscalYearStart(currentFYYear()).getTime()
  return Math.max(1, Math.min(52, Math.floor(diff / 6048e5) + 1))
}
function fiscalWeekToDate(fw: number, fyYear?: number): Date {
  const d = getFiscalYearStart(fyYear ?? currentFYYear())
  d.setDate(d.getDate() + (fw - 1) * 7)
  return d
}
function getMondayOf(fw: number): Date {
  const d = fiscalWeekToDate(fw)
  const dow = d.getDay()
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
  return d
}
function fmtFW(fw: number): string {
  const d = fiscalWeekToDate(fw)
  return `FW${fw} ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}
function fmtShort(d: Date): string {
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}
function quarterOf(fw: number): 1 | 2 | 3 | 4 {
  if (fw <= 13) return 1; if (fw <= 26) return 2; if (fw <= 39) return 3; return 4
}
function isBusy(fw: number): boolean { return fw <= 13 || fw >= 36 }
function fmtHour(h: number): string {
  if (h === 12) return '12 PM'; return h < 12 ? `${h} AM` : `${h - 12} PM`
}

const Q_COLORS: Record<number, { bg: string; text: string; border: string; light: string; dark: string; darkBorder: string }> = {
  1: { bg: 'bg-blue-600', text: 'text-blue-700', border: 'border-blue-400', light: 'bg-blue-50', dark: 'bg-blue-950', darkBorder: 'border-blue-700' },
  2: { bg: 'bg-emerald-600', text: 'text-emerald-700', border: 'border-emerald-400', light: 'bg-emerald-50', dark: 'bg-emerald-950', darkBorder: 'border-emerald-700' },
  3: { bg: 'bg-amber-500', text: 'text-amber-700', border: 'border-amber-400', light: 'bg-amber-50', dark: 'bg-amber-900', darkBorder: 'border-amber-600' },
  4: { bg: 'bg-rose-600', text: 'text-rose-700', border: 'border-rose-400', light: 'bg-rose-50', dark: 'bg-rose-950', darkBorder: 'border-rose-700' },
}

const PIECE_SYMBOLS: Record<string, string> = {
  king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟',
}

function scoreColor(s: number) {
  if (s >= 13) return 'bg-emerald-500'; if (s >= 9) return 'bg-blue-500'
  if (s >= 5) return 'bg-amber-400'; return 'bg-rose-400'
}

function eventOccursOn(evt: CalendarEvent, dateKey: string): boolean {
  if (!evt.recurrence) return evt.date === dateKey
  if (dateKey < evt.date) return false
  if (evt.recurrence.endDate && dateKey > evt.recurrence.endDate) return false
  if (evt.recurrence.type === 'daily') return true
  const dow = new Date(dateKey + 'T00:00:00').getDay()
  return (evt.recurrence.days ?? []).includes(dow)
}

function getSideMonths(fwStart: number, fwEnd: number, fyYear: number) {
  const result: Array<{ name: string; startFw: number; endFw: number }> = []
  let cur: { name: string; startFw: number; endFw: number } | null = null
  for (let fw = fwStart; fw <= fwEnd; fw++) {
    const name = fiscalWeekToDate(fw, fyYear).toLocaleDateString('en-US', { month: 'short' })
    if (!cur || cur.name !== name) { if (cur) result.push(cur); cur = { name, startFw: fw, endFw: fw } }
    else cur.endFw = fw
  }
  if (cur) result.push(cur)
  return result
}

// ── Story types (slimmed for sprint view) ─────────────────────────────────────

type Story = Pick<UserStory, 'id' | 'title' | 'finalScore' | 'board' | 'status' | 'sprintWeekStart' | 'sprintWeekEnd' | 'sprintStream' | 'parentStoryId'> & {
  children: Story[]
  category?: { name: string } | null
}

type PersonaRef = { id: string; name: string; chesspiece: string; color: string; description: string }

// ── Story detail modal ─────────────────────────────────────────────────────────

function StoryDetailModal({ storyId, projectId, onClose }: { storyId: string; projectId: string; onClose: () => void }) {
  const [story, setStory] = useState<UserStory | null>(null)
  useEffect(() => { fetch(`/api/stories/${storyId}`).then(r => r.json()).then(setStory) }, [storyId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
        {!story ? <div className="p-8 text-center text-slate-400 text-sm">Loading…</div> : (
          <>
            <div className={`px-5 pt-5 pb-3 border-b border-l-4 ${
              story.finalScore >= 13 ? 'border-l-emerald-500 bg-emerald-50' :
              story.finalScore >= 9 ? 'border-l-blue-500 bg-blue-50' :
              story.finalScore >= 5 ? 'border-l-amber-400 bg-amber-50' : 'border-l-rose-400 bg-rose-50'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-800 leading-snug">{story.title}</h2>
                  <div className="flex gap-2 mt-1 flex-wrap text-xs">
                    <span className={`px-2 py-0.5 rounded-full font-bold ${scoreColor(story.finalScore)} text-white`}>Score {story.finalScore}</span>
                    {story.category && <span className="text-slate-500">{story.category.name}</span>}
                    {story.inScope && <span className="text-blue-600 font-medium">✓ In Scope</span>}
                  </div>
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none flex-shrink-0">×</button>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm">
              <div className="grid grid-cols-4 gap-2 text-center bg-slate-50 rounded-lg p-3">
                {(['valueScore', 'riskScore', 'urgencyScore', 'effortScore'] as const).map(k => (
                  <div key={k}>
                    <div className="text-[10px] text-slate-400 capitalize">{k.replace('Score', '')}</div>
                    <div className="text-lg font-bold text-slate-700">{story[k]}</div>
                  </div>
                ))}
              </div>
              {story.sprintWeekStart !== null && (
                <div className="flex gap-3 text-xs text-slate-600">
                  <span className="font-medium">Sprint:</span>
                  <span>{fmtFW(story.sprintWeekStart)}{story.sprintWeekEnd && story.sprintWeekEnd !== story.sprintWeekStart ? ` – ${fmtFW(story.sprintWeekEnd)}` : ''}</span>
                </div>
              )}
              {story.userStory && <div><div className="text-xs text-slate-400 font-medium mb-1">User Story</div><p className="bg-slate-50 rounded p-2 text-slate-700 text-xs leading-relaxed">{story.userStory}</p></div>}
              {story.notes && <div><div className="text-xs text-slate-400 font-medium mb-1">Notes</div><p className="bg-slate-50 rounded p-2 text-slate-700 text-xs leading-relaxed">{story.notes}</p></div>}
              <div className="pt-2 border-t">
                <Link href={`/projects/${projectId}/board`} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Open in Board →</Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Single Day View ────────────────────────────────────────────────────────────

function SingleDayView({ date, stories, allEvents, personas, workstreams, onNavigate, onStoryClick, onEventCreate, onEventSelect }: {
  date: Date; stories: Story[]; allEvents: CalendarEvent[]; personas: PersonaRef[]; workstreams: Workstream[]
  onNavigate: (d: Date) => void; onStoryClick: (id: string) => void
  onEventCreate: (evt: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt' | 'projectId' | 'personaIds' | 'eventStories'> & { personaIds?: string[] }) => Promise<void>
  onEventSelect: (evt: CalendarEvent) => void
}) {
  const today = new Date()
  const isToday = date.toDateString() === today.toDateString()
  const fw = getFiscalWeek(date)
  const q = quarterOf(fw)
  const c = Q_COLORS[q]
  const dateKey = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
  const dayEvents = allEvents.filter(e => eventOccursOn(e, dateKey))
  const [hoveredHour, setHoveredHour] = useState<number | null>(null)
  const [draft, setDraft] = useState<{ hour: number } | null>(null)
  const [fTitle, setFTitle] = useState('')
  const [fType, setFType] = useState<'meeting' | 'milestone'>('meeting')
  const [fDur, setFDur] = useState(60)
  const [fNotes, setFNotes] = useState('')
  const [fRecur, setFRecur] = useState(false)
  const [fRecurType, setFRecurType] = useState<'daily' | 'weekly'>('weekly')
  const [fRecurDays, setFRecurDays] = useState<number[]>([])
  const [fRecurEnd, setFRecurEnd] = useState('')
  const [fPersonaIds, setFPersonaIds] = useState<string[]>([])

  const SLOT_H = 44
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const dateEnd = dateStart + 86399999

  function isActiveToday(s: Story): boolean {
    if (!s.sprintWeekStart) return false
    const sStart = fiscalWeekToDate(s.sprintWeekStart).getTime()
    const sEnd = fiscalWeekToDate(s.sprintWeekEnd ?? s.sprintWeekStart).getTime() + 6 * 86400000 + 86399999
    return sStart <= dateEnd && sEnd >= dateStart
  }
  const activeLevel1 = stories.filter(isActiveToday)

  const prevDay = new Date(date); prevDay.setDate(date.getDate() - 1)
  const nextDay = new Date(date); nextDay.setDate(date.getDate() + 1)
  const prevWk = new Date(date); prevWk.setDate(date.getDate() - 7)
  const nextWk = new Date(date); nextWk.setDate(date.getDate() + 7)
  const dayLabel = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()]
  const btn = 'px-2 py-0.5 text-[11px] rounded bg-white/20 hover:bg-white/40 text-white border border-white/30 cursor-pointer transition-colors select-none'

  function openDraft(hour: number) {
    setDraft({ hour }); setFTitle(''); setFType('meeting'); setFDur(60); setFNotes('')
    setFRecur(false); setFRecurType('weekly'); setFRecurDays([date.getDay()]); setFRecurEnd(''); setFPersonaIds([])
  }

  async function saveEvent() {
    if (!draft || !fTitle.trim()) return
    await onEventCreate({
      date: dateKey, startHour: draft.hour, durationMins: fType === 'milestone' ? 0 : fDur,
      title: fTitle.trim(), type: fType, notes: fNotes, transcript: null,
      recurrence: fRecur ? { type: fRecurType, ...(fRecurType === 'weekly' ? { days: fRecurDays.length ? fRecurDays : [date.getDay()] } : {}), ...(fRecurEnd ? { endDate: fRecurEnd } : {}) } : null,
      personaIds: fPersonaIds.length ? fPersonaIds : undefined,
    })
    setDraft(null)
  }

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden flex flex-col" style={{ minHeight: 320 }}>
      <div className={`${c.bg} px-4 py-2 flex items-center justify-between`}>
        <span className="text-[11px] font-bold tracking-widest text-white/90 uppercase">
          {date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </span>
        <div className="flex gap-1">
          <button className={btn} onClick={() => onNavigate(prevWk)}>← {dayLabel}</button>
          <button className={btn} onClick={() => onNavigate(prevDay)}>← 1d</button>
          <button className={btn} onClick={() => onNavigate(nextDay)}>1d →</button>
          <button className={btn} onClick={() => onNavigate(nextWk)}>{dayLabel} →</button>
        </div>
      </div>

      <div className="px-5 py-4 border-b flex items-end gap-4">
        <div className={`text-7xl font-black leading-none tabular-nums ${isToday ? 'text-red-500' : 'text-slate-800'}`}>{date.getDate()}</div>
        <div className="pb-1.5 flex flex-col gap-0.5">
          <span className="text-lg font-semibold text-slate-700">{date.toLocaleDateString('en-US', { weekday: 'long' })}</span>
          <span className="text-xs text-slate-400">{fmtFW(fw)}</span>
          {isToday && <span className="text-[10px] font-bold text-red-400 uppercase tracking-wide">Today</span>}
        </div>
      </div>

      {/* Stream rows */}
      <div className="flex-1 divide-y divide-slate-100">
        {workstreams.map((ws, si) => {
          const parents = activeLevel1.filter(s => (s.sprintStream ?? 0) === si)
          return (
            <div key={ws.id} className={`flex items-start gap-3 px-5 py-3 ${!parents.length ? 'bg-slate-50/60' : 'bg-white'}`}>
              <div className="text-[10px] font-bold uppercase tracking-widest w-20 flex-shrink-0 pt-1 leading-none truncate" style={{ color: ws.color }}>{ws.name}</div>
              {!parents.length ? <div className="flex-1 border-b border-slate-100 pb-1" /> : (
                <div className="flex-1 flex flex-wrap gap-1.5">
                  {parents.map(parent => {
                    const sc = Q_COLORS[quarterOf(parent.sprintWeekStart!)]
                    return (
                      <div key={parent.id}>
                        <button onClick={() => onStoryClick(parent.id)}
                          className={`flex items-center gap-1.5 border rounded-md px-2 py-1 text-xs font-semibold hover:brightness-95 transition-colors ${sc.light} ${sc.border} ${sc.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${scoreColor(parent.finalScore)}`} />
                          <span>{parent.title}</span>
                          <span className="opacity-50 ml-0.5">{parent.finalScore}</span>
                        </button>
                        {parent.children.length > 0 && (
                          <div className="ml-5 mt-1 flex flex-wrap gap-1">
                            {parent.children.map(child => (
                              <button key={child.id} onClick={() => onStoryClick(child.id)}
                                className="flex items-center gap-1 border border-slate-200 rounded px-1.5 py-0.5 text-[11px] text-slate-500 bg-white hover:bg-slate-50 hover:border-slate-400 transition-colors">
                                <span className="text-slate-300 mr-0.5">└</span>
                                <span className={`w-1 h-1 rounded-full flex-shrink-0 ${scoreColor(child.finalScore)}`} />
                                <span>{child.title}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
        {!workstreams.length && <div className="px-5 py-4 text-sm text-slate-300 italic">No workstreams — add them in Team view</div>}
      </div>

      {/* Hourly calendar 8–17 */}
      <div className="border-t border-slate-200" onMouseLeave={() => setHoveredHour(null)}>
        <div className="flex px-4 pt-1 pb-0.5 select-none">
          <div className="w-14 flex-shrink-0" />
          <div className="text-[9px] text-slate-400 font-medium uppercase tracking-widest">8–17 ET · click to add event</div>
        </div>
        {Array.from({ length: 10 }, (_, i) => i + 8).map(hour => {
          const slotEvts = dayEvents.filter(e => e.startHour === hour)
          const isHovered = hoveredHour === hour
          const isNow = isToday && new Date().getHours() === hour
          const evtHeights = slotEvts.map(e => e.type === 'milestone' ? 20 : Math.max(20, Math.round((e.durationMins / 60) * SLOT_H)))
          const evtTops = evtHeights.reduce<number[]>((acc, h, i) => [...acc, i === 0 ? 4 : acc[i - 1] + evtHeights[i - 1] + 4], [])
          const slotH = Math.max(SLOT_H, slotEvts.length === 0 ? SLOT_H : (evtTops[evtTops.length - 1] + evtHeights[evtHeights.length - 1] + 4))
          const hLabel = hour < 12 ? `${hour}` : hour === 12 ? '12' : `${hour - 12}`
          const hAmPm = hour < 12 ? 'AM' : 'PM'
          return (
            <div key={hour} style={{ height: slotH }} className={`relative flex cursor-pointer transition-colors duration-75 ${isHovered ? 'bg-blue-50' : ''}`}
              onMouseEnter={() => setHoveredHour(hour)} onClick={() => openDraft(hour)}>
              {isHovered && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-400 pointer-events-none z-10" />}
              <div className={`w-14 flex-shrink-0 text-right pr-3 pt-0.5 text-[10px] font-semibold leading-none select-none z-10 ${isNow ? 'text-red-500' : isHovered ? 'text-blue-600' : 'text-slate-500'}`}>
                {hLabel}<span className="text-[8px] ml-px">{hAmPm}</span>
              </div>
              <div className="flex-1 relative border-l border-slate-200">
                <div className={`absolute top-0 left-0 right-0 border-t ${isNow ? 'border-red-400' : 'border-slate-200'}`} />
                <div className="absolute left-0 right-0 border-t border-slate-100" style={{ top: 22 }} />
                {isNow && (() => {
                  const mins = new Date().getMinutes()
                  return <div className="absolute left-0 right-0 flex items-center pointer-events-none z-20" style={{ top: `${(mins / 60) * SLOT_H}px` }}>
                    <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 flex-shrink-0 shadow" />
                    <div className="flex-1 border-t-2 border-red-400" />
                  </div>
                })()}
                {isHovered && !slotEvts.length && <div className="absolute left-2 top-1 text-[10px] text-blue-400 font-medium select-none pointer-events-none">+ {fmtHour(hour)}</div>}
                {slotEvts.map((evt, ei) => (
                  <div key={evt.id} style={{ top: evtTops[ei], height: evtHeights[ei] }}
                    onClick={e => { e.stopPropagation(); onEventSelect(evt) }}
                    className={`absolute left-1 right-1 rounded-md flex items-center gap-1.5 px-2 text-[11px] font-medium border select-none cursor-pointer hover:brightness-95 ${evt.type === 'meeting' ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-amber-100 text-amber-800 border-amber-200'}`}>
                    <span className="flex-shrink-0">{evt.type === 'milestone' ? '◆' : '●'}</span>
                    <span className="flex-1 truncate">{evt.title}</span>
                    {evt.personaIds?.length > 0 && (
                      <span className="flex items-center gap-0.5 flex-shrink-0">
                        {evt.personaIds.slice(0, 3).map(pid => {
                          const p = personas.find(x => x.id === pid)
                          return p ? <span key={pid} className="w-2.5 h-2.5 rounded-full ring-1 ring-white" style={{ backgroundColor: p.color }} title={p.name} /> : null
                        })}
                        {evt.personaIds.length > 3 && <span className="text-[8px] opacity-50">+{evt.personaIds.length - 3}</span>}
                      </span>
                    )}
                    {evt.recurrence && <span className="opacity-50 text-[9px] flex-shrink-0" title="Recurring">↻</span>}
                    {evt.durationMins > 0 && <span className="opacity-40 text-[9px] flex-shrink-0">{evt.durationMins < 60 ? `${evt.durationMins}m` : `${evt.durationMins / 60}h`}</span>}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        <div className="flex" style={{ height: 1 }}>
          <div className="w-14 flex-shrink-0" />
          <div className="flex-1 border-t border-slate-200" />
        </div>
      </div>

      {/* Create event modal */}
      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDraft(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-80 overflow-hidden z-10">
            <div className="bg-slate-900 px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-white text-sm font-semibold">New Event</p>
                <p className="text-slate-400 text-[11px] mt-0.5">{date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {fmtHour(draft.hour)}</p>
              </div>
              <button onClick={() => setDraft(null)} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-3">
              <input autoFocus type="text" placeholder="Event title" value={fTitle} onChange={e => setFTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveEvent() }}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <div className="flex gap-2">
                {(['meeting', 'milestone'] as const).map(t => (
                  <button key={t} onClick={() => setFType(t)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${fType === t ? (t === 'meeting' ? 'bg-blue-500 text-white border-blue-500' : 'bg-amber-500 text-white border-amber-500') : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                    {t === 'meeting' ? '● Meeting' : '◆ Milestone'}
                  </button>
                ))}
              </div>
              {fType === 'meeting' && (
                <div className="flex gap-1.5">
                  {[30, 60, 90, 120].map(d => (
                    <button key={d} onClick={() => setFDur(d)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${fDur === d ? 'bg-slate-800 text-white border-slate-800' : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                      {d < 60 ? `${d}m` : `${d / 60}h`}
                    </button>
                  ))}
                </div>
              )}
              <textarea placeholder="Notes (optional)" rows={2} value={fNotes} onChange={e => setFNotes(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
              />
              {personas.length > 0 && (
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1.5">People</p>
                  <div className="flex flex-wrap gap-1.5">
                    {personas.map(p => {
                      const sel = fPersonaIds.includes(p.id)
                      return (
                        <button key={p.id} onClick={() => setFPersonaIds(prev => sel ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                          className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs border transition-colors ${sel ? 'text-white border-transparent shadow-sm' : 'text-slate-500 border-slate-200 bg-white hover:border-slate-400'}`}
                          style={sel ? { backgroundColor: p.color, borderColor: p.color } : {}}>
                          <span style={sel ? { color: 'white' } : { color: p.color }}>{PIECE_SYMBOLS[p.chesspiece] ?? '♟'}</span>
                          <span>{p.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <button onClick={() => setFRecur(r => !r)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold transition-colors ${fRecur ? 'bg-violet-50 text-violet-700' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                  <span>↻ Repeat</span>
                  <span className={`w-7 h-4 rounded-full flex items-center px-0.5 transition-colors ${fRecur ? 'bg-violet-500' : 'bg-slate-300'}`}>
                    <span className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${fRecur ? 'translate-x-3' : ''}`} />
                  </span>
                </button>
                {fRecur && (
                  <div className="px-3 pb-3 pt-2 space-y-2.5 bg-violet-50/40">
                    <div className="flex gap-1.5">
                      {(['daily', 'weekly'] as const).map(rt => (
                        <button key={rt} onClick={() => setFRecurType(rt)}
                          className={`flex-1 py-1 rounded text-xs font-medium border transition-colors ${fRecurType === rt ? 'bg-violet-600 text-white border-violet-600' : 'text-slate-500 border-slate-200 bg-white'}`}>
                          {rt === 'daily' ? 'Daily' : 'Weekly'}
                        </button>
                      ))}
                    </div>
                    {fRecurType === 'weekly' && (
                      <div className="flex gap-1">
                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((label, dow) => (
                          <button key={dow} onClick={() => setFRecurDays(prev => prev.includes(dow) ? prev.filter(d => d !== dow) : [...prev, dow].sort())}
                            className={`flex-1 py-1 rounded text-[10px] font-semibold border transition-colors ${fRecurDays.includes(dow) ? 'bg-violet-600 text-white border-violet-600' : 'text-slate-400 border-slate-200 bg-white'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                    <input type="date" value={fRecurEnd} onChange={e => setFRecurEnd(e.target.value)} min={dateKey}
                      className="w-full border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                    />
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={saveEvent} disabled={!fTitle.trim()}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 transition-colors">Save</button>
                <button onClick={() => setDraft(null)} className="px-4 py-2 rounded-lg text-sm text-slate-500 border border-slate-200 hover:bg-slate-50">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Gantt View ─────────────────────────────────────────────────────────────────

const COL_W = 120
const ROW_H = 48
const HANDLE = 8

type DragState = { storyId: string; type: 'left' | 'right' | 'move'; startX: number; startY: number; initStart: number; initEnd: number; initStream: number; colPx: number }
type Preview = Record<string, { weekStart: number; weekEnd: number; stream: number }>

function GanttView({ stories, workstreams, onUpdate, pivotFW, onNavigate, onStoryClick }: {
  stories: Story[]; workstreams: Workstream[]; onUpdate: (id: string, data: Partial<UserStory>) => Promise<void>
  pivotFW: number; onNavigate: (delta: number) => void; onStoryClick: (id: string) => void
}) {
  const streamCount = Math.max(workstreams.length, 1)
  const viewStart = Math.max(1, pivotFW - 2)
  const viewEnd = Math.min(52, viewStart + 11)
  const weeks = Array.from({ length: viewEnd - viewStart + 1 }, (_, i) => viewStart + i)
  const laneRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const previewRef = useRef<Preview>({})
  const [preview, setPreview] = useState<Preview>({})
  useEffect(() => { previewRef.current = preview }, [preview])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current
      if (!d) return
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      const weekDelta = Math.round(dx / d.colPx)
      const curP = previewRef.current[d.storyId] ?? { weekStart: d.initStart, weekEnd: d.initEnd, stream: d.initStream }
      let next = { ...curP }
      if (d.type === 'move') {
        const streamDelta = Math.round(dy / ROW_H)
        next.weekStart = Math.max(1, Math.min(52, d.initStart + weekDelta))
        next.weekEnd = Math.max(next.weekStart, Math.min(52, d.initEnd + weekDelta))
        next.stream = Math.max(0, Math.min(streamCount - 1, d.initStream + streamDelta))
      } else if (d.type === 'left') {
        next.weekStart = Math.max(1, Math.min(d.initEnd, d.initStart + weekDelta))
      } else {
        next.weekEnd = Math.max(d.initStart, Math.min(52, d.initEnd + weekDelta))
      }
      setPreview(prev => ({ ...prev, [d.storyId]: next }))
    }
    const onUp = async () => {
      const d = dragRef.current
      if (!d) return
      dragRef.current = null
      const p = previewRef.current[d.storyId]
      if (p) {
        setPreview(prev => { const n = { ...prev }; delete n[d.storyId]; return n })
        await onUpdate(d.storyId, { sprintWeekStart: p.weekStart, sprintWeekEnd: p.weekEnd, sprintStream: String(p.stream) })
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [onUpdate, streamCount])

  function startDrag(e: React.MouseEvent, story: Story, type: DragState['type']) {
    e.preventDefault()
    const colPx = laneRef.current ? laneRef.current.clientWidth / weeks.length : COL_W
    dragRef.current = {
      storyId: story.id, type, startX: e.clientX, startY: e.clientY,
      initStart: story.sprintWeekStart ?? viewStart, initEnd: story.sprintWeekEnd ?? story.sprintWeekStart ?? viewStart,
      initStream: Number(story.sprintStream ?? 0), colPx,
    }
  }

  function colLeft(fw: number) { return (fw - viewStart) * COL_W }

  const currentFW = getFiscalWeek(new Date())
  const today = new Date()

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200 bg-slate-50">
        <button onClick={() => onNavigate(-1)} className="w-6 h-6 flex items-center justify-center rounded border border-slate-300 text-slate-500 hover:bg-slate-100 text-sm">‹</button>
        <span className="text-xs font-semibold text-slate-600">12-week Gantt · {fmtFW(viewStart)} – {fmtFW(viewEnd)}</span>
        <button onClick={() => onNavigate(1)} className="w-6 h-6 flex items-center justify-center rounded border border-slate-300 text-slate-500 hover:bg-slate-100 text-sm">›</button>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: COL_W * weeks.length + 160 }}>
          {/* Week header */}
          <div className="flex border-b border-slate-200">
            <div className="w-40 flex-shrink-0 border-r border-slate-200 bg-slate-50" />
            {weeks.map(fw => {
              const q = quarterOf(fw); const c = Q_COLORS[q]; const busy = isBusy(fw)
              return (
                <div key={fw} style={{ width: COL_W, minWidth: COL_W }}
                  className={`flex-shrink-0 px-1 py-1 text-center border-r border-slate-100 ${fw === currentFW ? c.bg + ' text-white' : busy ? c.dark + ' ' + c.darkBorder + ' text-white/80' : c.light + ' ' + c.text}`}>
                  <div className="text-[10px] font-bold">{fw}</div>
                  <div className="text-[9px] opacity-70">{fmtShort(fiscalWeekToDate(fw))}</div>
                </div>
              )
            })}
          </div>

          {/* Lanes */}
          <div ref={laneRef} className="relative">
            {workstreams.map((ws, si) => {
              const laneStories = stories.filter(s => (s.sprintWeekStart !== null) && (s.sprintStream ?? 0) === si)
              return (
                <div key={ws.id} style={{ height: ROW_H }} className="flex border-b border-slate-100 relative">
                  <div className="w-40 flex-shrink-0 border-r border-slate-200 px-3 flex items-center" style={{ backgroundColor: ws.color + '18' }}>
                    <span className="text-xs font-semibold truncate" style={{ color: ws.color }}>{ws.name}</span>
                  </div>
                  <div className="flex-1 relative">
                    {/* Week grid lines */}
                    {weeks.map(fw => (
                      <div key={fw} style={{ left: (fw - viewStart) * COL_W, width: COL_W }}
                        className={`absolute top-0 bottom-0 border-r border-slate-100 ${fw === currentFW ? 'bg-yellow-50' : ''}`} />
                    ))}
                    {/* Stories */}
                    {laneStories.map(s => {
                      const p = preview[s.id]
                      const wStart = p ? p.weekStart : (s.sprintWeekStart ?? viewStart)
                      const wEnd = p ? p.weekEnd : (s.sprintWeekEnd ?? wStart)
                      const stream = p ? p.stream : (s.sprintStream ?? 0)
                      if (stream !== si) return null
                      const left = colLeft(Math.max(wStart, viewStart))
                      const right = colLeft(Math.min(wEnd, viewEnd) + 1)
                      if (left >= COL_W * weeks.length || right <= 0) return null
                      const q = quarterOf(wStart); const c = Q_COLORS[q]
                      return (
                        <div key={s.id} style={{ left, width: right - left, top: 4, height: ROW_H - 8, position: 'absolute' }}
                          className={`rounded flex items-center px-2 gap-1.5 border select-none group ${p ? 'opacity-80 ring-2 ring-blue-400' : ''} ${c.light} ${c.border} ${c.text}`}>
                          <div className="w-2 h-full absolute left-0 top-0 cursor-ew-resize rounded-l opacity-0 group-hover:opacity-100 bg-current/20 hover:bg-current/40"
                            onMouseDown={e => startDrag(e, s, 'left')} onClick={e => e.stopPropagation()} />
                          <button className="flex-1 flex items-center gap-1.5 min-w-0 text-left"
                            onMouseDown={e => startDrag(e, s, 'move')} onClick={() => { if (!dragRef.current) onStoryClick(s.id) }}>
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${scoreColor(s.finalScore)}`} />
                            <span className="text-[11px] font-medium truncate">{s.title}</span>
                          </button>
                          <div className="w-2 h-full absolute right-0 top-0 cursor-ew-resize rounded-r opacity-0 group-hover:opacity-100 bg-current/20 hover:bg-current/40"
                            onMouseDown={e => startDrag(e, s, 'right')} onClick={e => e.stopPropagation()} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {/* Unscheduled / no stream */}
            <div style={{ minHeight: ROW_H }} className="flex border-b border-slate-100">
              <div className="w-40 flex-shrink-0 border-r border-slate-200 px-3 flex items-center bg-slate-50">
                <span className="text-xs text-slate-400 font-medium">Unscheduled</span>
              </div>
              <div className="flex-1 px-2 py-1 flex flex-wrap gap-1 items-center">
                {stories.filter(s => s.sprintWeekStart === null).map(s => (
                  <button key={s.id} onClick={() => onStoryClick(s.id)}
                    className="px-2 py-0.5 text-[11px] border border-slate-200 rounded bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50 transition-colors truncate max-w-[160px]">
                    {s.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Event detail panel ─────────────────────────────────────────────────────────

function EventDetailPanel({ event, stories, personas, projectId, onUpdate, onDelete, onClose, onReload }: {
  event: CalendarEvent; stories: Story[]; personas: PersonaRef[]; projectId: string
  onUpdate: (id: string, data: Partial<CalendarEvent>) => Promise<void>
  onDelete: (id: string) => Promise<void>; onClose: () => void; onReload: () => Promise<void>
}) {
  const [transcript, setTranscript] = useState(event.transcript ?? '')
  const [transcriptDirty, setTranscriptDirty] = useState(false)
  const [fTitle, setFTitle] = useState(event.title)
  const [fType, setFType] = useState(event.type)
  const [fDur, setFDur] = useState(event.durationMins)
  const [fNotes, setFNotes] = useState(event.notes ?? '')
  const [fPersonaIds, setFPersonaIds] = useState(event.personaIds)
  const [fRecur, setFRecur] = useState(!!event.recurrence)
  const [fRecurType, setFRecurType] = useState<'daily' | 'weekly'>(event.recurrence?.type ?? 'weekly')
  const [fRecurDays, setFRecurDays] = useState(event.recurrence?.days ?? [])
  const [fRecurEnd, setFRecurEnd] = useState(event.recurrence?.endDate ?? '')
  const [linkedStories, setLinkedStories] = useState(event.eventStories ?? [])
  const [newStoryTitle, setNewStoryTitle] = useState('')
  const [linkQuery, setLinkQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [addingStory, setAddingStory] = useState(false)

  const filteredStories = linkQuery.trim() ? stories.filter(s => s.title.toLowerCase().includes(linkQuery.toLowerCase()) && !linkedStories.some(l => l.storyId === s.id)) : []

  async function saveTranscript() {
    if (!transcriptDirty) return
    await onUpdate(event.id, { transcript })
    setTranscriptDirty(false)
  }

  async function saveMetadata() {
    setSaving(true)
    await onUpdate(event.id, {
      title: fTitle, type: fType, durationMins: fDur, notes: fNotes, personaIds: fPersonaIds,
      recurrence: fRecur ? { type: fRecurType, ...(fRecurType === 'weekly' ? { days: fRecurDays } : {}), ...(fRecurEnd ? { endDate: fRecurEnd } : {}) } : null,
    })
    setSaving(false)
  }

  async function linkStory(storyId: string, role: string) {
    await fetch(`/api/calendar-events/${event.id}/stories`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storyId, role }),
    })
    setLinkQuery('')
    await onReload()
    const fresh = await fetch(`/api/calendar-events/${event.id}`).then(r => r.json()) as CalendarEvent
    setLinkedStories(fresh.eventStories ?? [])
  }

  async function createAndLinkStory() {
    if (!newStoryTitle.trim() || addingStory) return
    setAddingStory(true)
    await fetch(`/api/calendar-events/${event.id}/stories`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newStoryTitle.trim(), role: 'created' }),
    })
    setNewStoryTitle('')
    setAddingStory(false)
    await onReload()
    const fresh = await fetch(`/api/calendar-events/${event.id}`).then(r => r.json()) as CalendarEvent
    setLinkedStories(fresh.eventStories ?? [])
  }

  async function unlinkStory(storyId: string) {
    await fetch(`/api/calendar-events/${event.id}/stories`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storyId }),
    })
    const fresh = await fetch(`/api/calendar-events/${event.id}`).then(r => r.json()) as CalendarEvent
    setLinkedStories(fresh.eventStories ?? [])
  }

  const dateFmt = new Date(event.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  return (
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="absolute inset-x-0 bottom-0 bg-white shadow-2xl border-t border-slate-200 flex overflow-hidden" style={{ height: '60vh', maxHeight: 560 }} onClick={e => e.stopPropagation()}>
        <div className="flex-1 flex flex-col overflow-hidden border-r border-slate-100">
          <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-3 flex-shrink-0 bg-slate-50">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${event.type === 'meeting' ? 'bg-blue-500' : 'bg-amber-500'}`} />
            <span className="font-semibold text-slate-800 text-sm flex-1 truncate">{event.title}</span>
            <span className="text-xs text-slate-400">{dateFmt} · {fmtHour(event.startHour)}</span>
            {event.durationMins > 0 && <span className="text-xs text-slate-400">{event.durationMins < 60 ? `${event.durationMins}m` : `${event.durationMins / 60}h`}</span>}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none ml-1">×</button>
          </div>
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 flex flex-col p-5 overflow-y-auto border-r border-slate-100">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">Meeting Transcript</label>
              <textarea className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none leading-relaxed"
                placeholder="Paste or type meeting notes…" value={transcript}
                onChange={e => { setTranscript(e.target.value); setTranscriptDirty(true) }} onBlur={saveTranscript}
              />
              {transcriptDirty && <p className="text-[10px] text-slate-400 mt-1">Unsaved — click outside to save</p>}
            </div>
            <div className="w-72 flex-shrink-0 flex flex-col p-4 overflow-y-auto space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Stories Discussed</p>
                {!linkedStories.length ? <p className="text-xs text-slate-400 italic">None linked yet</p> : (
                  <div className="space-y-1.5">
                    {linkedStories.map(link => (
                      <div key={link.storyId} className="flex items-start gap-2 bg-slate-50 rounded-lg px-2 py-1.5 border border-slate-200">
                        <span className={`mt-0.5 flex-shrink-0 text-[9px] font-bold uppercase px-1 py-0.5 rounded ${link.role === 'created' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{link.role}</span>
                        <span className="text-xs text-slate-700 flex-1 leading-snug">{link.story.title}</span>
                        <button onClick={() => unlinkStory(link.storyId)} className="text-slate-300 hover:text-red-400 text-xs flex-shrink-0">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">New Story from Meeting</p>
                <div className="flex gap-1">
                  <input type="text" placeholder="Story title…" value={newStoryTitle} onChange={e => setNewStoryTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && createAndLinkStory()}
                    className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                  <button onClick={createAndLinkStory} disabled={!newStoryTitle.trim() || addingStory}
                    className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-40">+</button>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Link Existing Story</p>
                <input type="text" placeholder="Search stories…" value={linkQuery} onChange={e => setLinkQuery(e.target.value)}
                  className="w-full border border-slate-200 rounded px-2 py-1 text-xs mb-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <div className="space-y-1">
                  {filteredStories.map(s => (
                    <button key={s.id} onClick={() => linkStory(s.id, 'discussed')}
                      className="w-full text-left text-xs px-2 py-1 rounded hover:bg-blue-50 hover:text-blue-700 text-slate-600 border border-transparent hover:border-blue-200 truncate">
                      {s.title}
                    </button>
                  ))}
                  {linkQuery && !filteredStories.length && <p className="text-xs text-slate-400 italic">No matches</p>}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="w-72 flex-shrink-0 overflow-y-auto p-5 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Event Details</p>
          <div>
            <label className="text-[10px] text-slate-400 uppercase tracking-widest mb-1 block">Title</label>
            <input type="text" value={fTitle} onChange={e => setFTitle(e.target.value)}
              className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div className="flex gap-2">
            {(['meeting', 'milestone'] as const).map(t => (
              <button key={t} onClick={() => setFType(t)}
                className={`flex-1 py-1.5 rounded text-xs font-semibold border transition-colors ${fType === t ? (t === 'meeting' ? 'bg-blue-500 text-white border-blue-500' : 'bg-amber-500 text-white border-amber-500') : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                {t === 'meeting' ? '● Meeting' : '◆ Milestone'}
              </button>
            ))}
          </div>
          {fType === 'meeting' && (
            <div className="flex gap-1.5">
              {[30, 60, 90, 120].map(d => (
                <button key={d} onClick={() => setFDur(d)}
                  className={`flex-1 py-1.5 rounded text-xs font-medium border transition-colors ${fDur === d ? 'bg-slate-800 text-white border-slate-800' : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                  {d < 60 ? `${d}m` : `${d / 60}h`}
                </button>
              ))}
            </div>
          )}
          <div>
            <label className="text-[10px] text-slate-400 uppercase tracking-widest mb-1 block">Notes</label>
            <textarea rows={2} value={fNotes} onChange={e => setFNotes(e.target.value)}
              className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          {personas.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1.5">People</p>
              <div className="flex flex-wrap gap-1.5">
                {personas.map(p => {
                  const sel = fPersonaIds.includes(p.id)
                  return (
                    <button key={p.id} onClick={() => setFPersonaIds(prev => sel ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${sel ? 'text-white border-transparent' : 'text-slate-500 border-slate-200 bg-white hover:border-slate-400'}`}
                      style={sel ? { backgroundColor: p.color, borderColor: p.color } : {}}>
                      <span style={sel ? { color: 'white' } : { color: p.color }}>{PIECE_SYMBOLS[p.chesspiece] ?? '♟'}</span>
                      <span>{p.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={saveMetadata} disabled={saving}
              className="flex-1 py-2 rounded text-sm font-semibold bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 transition-colors">
              {saving ? 'Saving…' : 'Update'}
            </button>
            <button onClick={() => onDelete(event.id)} className="px-3 py-2 rounded text-sm text-red-500 border border-red-200 hover:bg-red-50">Delete</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Fiscal Year Board (Monopoly-style) ─────────────────────────────────────────

const CELL = 34
const MLABEL = 16

function BoardCell({ week, current, focused, stories, onSelect }: {
  week: number; current: number; focused: number | null; stories: Story[]; onSelect?: (fw: number) => void
}) {
  const q = quarterOf(week); const c = Q_COLORS[q]; const busy = isBusy(week)
  const ws = stories.filter(s => s.sprintWeekStart !== null && s.sprintWeekStart <= week && (s.sprintWeekEnd ?? s.sprintWeekStart) >= week)
  const isCurrent = week === current; const isFocused = focused === week
  let cls: string
  if (isCurrent) cls = `ring-2 ring-yellow-400 ring-inset z-10 ${c.bg} text-white font-bold`
  else if (isFocused) cls = `ring-2 ring-white ring-inset z-10 ${c.bg} text-white font-bold`
  else if (busy) cls = `${c.dark} ${c.darkBorder} text-white`
  else cls = `${c.light} ${c.border} ${c.text}`
  return (
    <div title={fmtFW(week)} style={{ width: CELL, height: CELL }} onClick={() => onSelect?.(week)}
      className={`relative flex flex-col items-center justify-center border text-center overflow-hidden ${onSelect ? 'cursor-pointer hover:brightness-110' : ''} ${cls}`}>
      <span className="text-xs leading-none font-medium">{week}</span>
      {ws.length > 0 && (
        <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center px-0.5">
          {ws.slice(0, 3).map(s => <span key={s.id} className={`w-1.5 h-1.5 rounded-full ${scoreColor(s.finalScore)}`} />)}
          {ws.length > 3 && <span className="text-[8px] leading-none">+{ws.length - 3}</span>}
        </div>
      )}
    </div>
  )
}

function CornerCell({ label }: { label: string }) {
  return (
    <div style={{ width: CELL, height: CELL }} className="flex items-center justify-center bg-slate-800 text-white text-[8px] font-bold text-center leading-tight border border-slate-600">
      <span style={{ whiteSpace: 'pre-line' }}>{label}</span>
    </div>
  )
}

function FiscalBoard({ stories, focusedFW, onSelectFW }: { stories: Story[]; focusedFW: number | null; onSelectFW: (fw: number) => void }) {
  const currentFW = getFiscalWeek(new Date())
  const fyYear = currentFYYear()
  const boardW = CELL * 15; const boardH = CELL * 15

  function posOf(fw: number): { r: number; c: number } {
    if (fw <= 13) return { r: 14, c: 14 - fw }
    if (fw <= 26) return { r: 27 - fw, c: 0 }
    if (fw <= 39) return { r: 0, c: fw - 26 }
    return { r: fw - 39, c: 14 }
  }

  const flat = stories.flatMap(s => [s, ...s.children])
  const topMonths = getSideMonths(27, 39, fyYear)
  const bottomMonths = getSideMonths(1, 13, fyYear)
  const leftMonths = getSideMonths(14, 26, fyYear)
  const rightMonths = getSideMonths(40, 52, fyYear)

  return (
    <div className="inline-block select-none">
      <div style={{ marginLeft: MLABEL + CELL, marginRight: MLABEL + CELL, display: 'flex', marginBottom: 1 }}>
        {topMonths.map(m => (
          <div key={m.name} style={{ width: (m.endFw - m.startFw + 1) * CELL, height: MLABEL }}
            className="flex items-center justify-center text-[9px] font-semibold text-slate-500 bg-slate-100 border-b border-slate-300">{m.name}</div>
        ))}
      </div>
      <div className="flex">
        <div style={{ paddingTop: CELL, paddingBottom: CELL, display: 'flex', flexDirection: 'column', marginRight: 1 }}>
          {[...leftMonths].reverse().map(m => (
            <div key={m.name} style={{ height: (m.endFw - m.startFw + 1) * CELL, width: MLABEL }}
              className="flex items-center justify-center text-[9px] font-semibold text-slate-500 bg-slate-100 border-r border-slate-300">
              <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{m.name}</span>
            </div>
          ))}
        </div>
        <div className="border-2 border-slate-700 rounded shadow-lg bg-white" style={{ position: 'relative', width: boardW, height: boardH }}>
          <div style={{ position: 'absolute', left: 14 * CELL, top: 14 * CELL }}><CornerCell label={'GO\nNov'} /></div>
          <div style={{ position: 'absolute', left: 0, top: 14 * CELL }}><CornerCell label={'→Q2\nJan'} /></div>
          <div style={{ position: 'absolute', left: 0, top: 0 }}><CornerCell label={'→Q3\nApr'} /></div>
          <div style={{ position: 'absolute', left: 14 * CELL, top: 0 }}><CornerCell label={'→Q4\nJul'} /></div>
          {Array.from({ length: 52 }, (_, i) => i + 1).map(fw => {
            const { r, c } = posOf(fw)
            return (
              <div key={fw} style={{ position: 'absolute', left: c * CELL, top: r * CELL }}>
                <BoardCell week={fw} current={currentFW} focused={focusedFW} stories={flat} onSelect={onSelectFW} />
              </div>
            )
          })}
          {/* Center stats */}
          <div style={{ position: 'absolute', left: CELL, top: CELL, width: 13 * CELL, height: 13 * CELL }}
            className="flex flex-col items-center justify-center bg-slate-50 border border-slate-200 overflow-hidden p-2 gap-1">
            <div className="text-[8px] font-bold uppercase tracking-widest text-slate-400">Sprint Board</div>
            <div className="text-3xl font-black text-slate-700 leading-none">{stories.filter(s => s.status !== 'done' && s.board !== 'Complete').length}</div>
            <div className="text-[8px] text-slate-400">active stories</div>
          </div>
        </div>
        <div style={{ paddingTop: CELL, paddingBottom: CELL, display: 'flex', flexDirection: 'column', marginLeft: 1 }}>
          {rightMonths.map(m => (
            <div key={m.name} style={{ height: (m.endFw - m.startFw + 1) * CELL, width: MLABEL }}
              className="flex items-center justify-center text-[9px] font-semibold text-slate-500 bg-slate-100 border-l border-slate-300">
              <span style={{ writingMode: 'vertical-rl' }}>{m.name}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginLeft: MLABEL + CELL, marginRight: MLABEL + CELL, display: 'flex', marginTop: 1 }}>
        {[...bottomMonths].reverse().map(m => (
          <div key={m.name} style={{ width: (m.endFw - m.startFw + 1) * CELL, height: MLABEL }}
            className="flex items-center justify-center text-[9px] font-semibold text-slate-500 bg-slate-100 border-t border-slate-300">{m.name}</div>
        ))}
      </div>
    </div>
  )
}

// ── Sprint Page ────────────────────────────────────────────────────────────────

export default function SprintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params)
  const [project, setProject] = useState<Project | null>(null)
  const [stories, setStories] = useState<Story[]>([])
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([])
  const [personas, setPersonas] = useState<PersonaRef[]>([])
  const [workstreams, setWorkstreams] = useState<Workstream[]>([])
  const [loading, setLoading] = useState(true)
  const [focusedFW, setFocusedFW] = useState<number | null>(null)
  const [ganttPivot, setGanttPivot] = useState(() => getFiscalWeek(new Date()))
  const [dayViewDate, setDayViewDate] = useState(() => new Date())
  const [detailStoryId, setDetailStoryId] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)

  const load = useCallback(async () => {
    const [projRes, storiesRes, eventsRes, personasRes, wsRes] = await Promise.all([
      fetch(`/api/projects/${projectId}`).then(r => r.json()),
      fetch(`/api/projects/${projectId}/stories`).then(r => r.json()),
      fetch(`/api/projects/${projectId}/calendar-events`).then(r => r.json()),
      fetch('/api/personas').then(r => r.json()),
      fetch(`/api/projects/${projectId}/workstreams`).then(r => r.json()),
    ])
    setProject(projRes)
    setStories(storiesRes)
    setAllEvents(eventsRes)
    setPersonas(personasRes)
    setWorkstreams(wsRes)
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  const handleUpdate = useCallback(async (id: string, data: Partial<UserStory>) => {
    await fetch(`/api/stories/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    await load()
  }, [load])

  const handleSelectFW = useCallback((fw: number) => {
    setFocusedFW(fw); setGanttPivot(fw); setDayViewDate(getMondayOf(fw))
  }, [])

  const handleEventCreate = useCallback(async (evt: Parameters<typeof SingleDayView>[0]['onEventCreate'] extends (e: infer E) => unknown ? E : never) => {
    await fetch(`/api/projects/${projectId}/calendar-events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(evt),
    })
    setAllEvents(await fetch(`/api/projects/${projectId}/calendar-events`).then(r => r.json()))
  }, [projectId])

  const handleEventUpdate = useCallback(async (id: string, data: Partial<CalendarEvent>) => {
    const updated = await fetch(`/api/calendar-events/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json())
    setAllEvents(prev => prev.map(e => e.id === id ? updated : e))
    setSelectedEvent(updated)
  }, [])

  const handleEventDelete = useCallback(async (id: string) => {
    await fetch(`/api/calendar-events/${id}`, { method: 'DELETE' })
    setAllEvents(prev => prev.filter(e => e.id !== id))
    setSelectedEvent(null)
  }, [])

  const handleEventSelect = useCallback(async (evt: CalendarEvent) => {
    setSelectedEvent(await fetch(`/api/calendar-events/${evt.id}`).then(r => r.json()))
  }, [])

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Loading…</div>

  const today = new Date()
  const fy = currentFYYear()

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white px-6 py-3 flex items-center gap-4">
        <Link href="/" className="text-slate-400 hover:text-white text-sm">← Projects</Link>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: project?.color }} />
          <span className="font-semibold text-sm">{project?.name}</span>
        </div>
        <nav className="flex items-center gap-1 ml-2">
          <Link href={`/projects/${projectId}/board`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors">Board</Link>
          <Link href={`/projects/${projectId}/personas`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors">Team</Link>
          <span className="px-3 py-1 rounded text-sm font-medium bg-white/10">Sprint</span>
                    <Link href={`/projects/${projectId}/archive`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors">Archive</Link>
          <Link href={`/projects/${projectId}/critical-path`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors">Critical Path</Link>
          <Link href={`/projects/${projectId}/documents`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors">Docs</Link>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <span className="text-slate-400">FY{fy}–{fy + 1}</span>
          <span className="text-slate-300">{fmtFW(getFiscalWeek(today))}</span>
          {focusedFW && (
            <button onClick={() => { setFocusedFW(null); setGanttPivot(getFiscalWeek(today)); setDayViewDate(new Date()) }}
              className="text-blue-300 hover:text-blue-100 border border-blue-700 px-2 py-0.5 rounded transition-colors">
              viewing {fmtFW(focusedFW)} · reset ✕
            </button>
          )}
        </div>
              <UserNav />
      </header>

      <div className="p-4 space-y-6">
        <div className="flex gap-4 items-start">
          <div className="flex-shrink-0">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Fiscal Year Board</div>
            <FiscalBoard stories={stories} focusedFW={focusedFW ?? ganttPivot} onSelectFW={handleSelectFW} />
          </div>
          <div className="flex-1 min-w-0">
            <SingleDayView
              date={dayViewDate} stories={stories} allEvents={allEvents} personas={personas} workstreams={workstreams}
              onNavigate={setDayViewDate} onStoryClick={setDetailStoryId}
              onEventCreate={handleEventCreate} onEventSelect={handleEventSelect}
            />
          </div>
        </div>

        <GanttView stories={stories} workstreams={workstreams} onUpdate={handleUpdate} pivotFW={ganttPivot}
          onNavigate={delta => setGanttPivot(prev => Math.max(1, Math.min(52, prev + delta)))}
          onStoryClick={setDetailStoryId}
        />
      </div>

      {selectedEvent && (
        <EventDetailPanel event={selectedEvent} stories={stories.flatMap(s => [s, ...s.children])} personas={personas} projectId={projectId}
          onUpdate={handleEventUpdate} onDelete={handleEventDelete} onClose={() => setSelectedEvent(null)}
          onReload={async () => { setSelectedEvent(await fetch(`/api/calendar-events/${selectedEvent.id}`).then(r => r.json())) }}
        />
      )}

      {detailStoryId && <StoryDetailModal storyId={detailStoryId} projectId={projectId} onClose={() => setDetailStoryId(null)} />}
    </div>
  )
}
