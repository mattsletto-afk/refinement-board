'use client'
import { use, useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { scoreTier, SCORE_TIER_CLASSES } from '@/src/domain/scoring'
import type { Project, UserStory, Workstream } from '@/src/domain/types'
import UserNav from '@/app/components/UserNav'

interface Epic { id: string; title: string; description: string; status: string; priority: string; sequence: number | null; committed?: boolean }
interface Feature { id: string; title: string; description: string; status: string; priority: string; epicId: string | null; sequence: number | null; committed?: boolean }

// ── Convert menu ──────────────────────────────────────────────────────────────

function ConvertMenu({ storyId, onConvert }: { storyId: string; onConvert: (id: string, to: 'epic' | 'feature') => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Convert to another type"
        className="text-[10px] font-medium text-gray-300 hover:text-purple-600 border border-gray-200 hover:border-purple-300 px-1.5 py-0.5 rounded transition-colors opacity-0 group-hover:opacity-100"
      >
        type ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 min-w-[130px]">
            <div className="px-3 py-1 text-[10px] text-gray-400 uppercase tracking-wide font-semibold border-b border-gray-100 mb-1">Convert to</div>
            <button
              onClick={() => { onConvert(storyId, 'feature'); setOpen(false) }}
              className="w-full text-left text-xs px-3 py-1.5 hover:bg-blue-50 text-blue-700 flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-sm bg-blue-400" />Feature
            </button>
            <button
              onClick={() => { onConvert(storyId, 'epic'); setOpen(false) }}
              className="w-full text-left text-xs px-3 py-1.5 hover:bg-indigo-50 text-indigo-700 flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full bg-indigo-400" />Epic
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Story row ─────────────────────────────────────────────────────────────────

function StoryRow({
  story,
  selected,
  onSelect,
  onUpdate,
  dragDisabled,
  onConvert,
  selectMode,
  multiSelected,
  onMultiSelect,
}: {
  story: UserStory
  selected: boolean
  onSelect: () => void
  onUpdate: (id: string, data: Partial<UserStory>) => void
  dragDisabled?: boolean
  onConvert?: (id: string, to: 'epic' | 'feature') => void
  selectMode?: boolean
  multiSelected?: boolean
  onMultiSelect?: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: story.id, disabled: dragDisabled || selectMode })
  const tier = scoreTier(story.finalScore)
  const isActive = story.status === 'active'
  const isCommitted = (story as UserStory & { committed?: boolean }).committed
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  function handleClick() {
    if (selectMode && onMultiSelect) { onMultiSelect(story.id) } else { onSelect() }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-3 px-3 py-2.5 border rounded-lg cursor-pointer transition-all relative
        ${multiSelected
          ? 'border-violet-400 bg-violet-50 shadow-sm'
          : selected
          ? 'border-indigo-400 bg-indigo-50 shadow-sm'
          : isActive
          ? 'border-emerald-400 bg-emerald-50/60 shadow-sm hover:shadow-md'
          : isCommitted
          ? 'border-emerald-200 bg-emerald-50/30 hover:border-emerald-300 hover:shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'}`}
      onClick={handleClick}
    >
      {/* Active pulse bar */}
      {isActive && (
        <span className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg bg-emerald-500 animate-pulse" />
      )}
      {/* Committed bar */}
      {!isActive && isCommitted && (
        <span className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg bg-emerald-300" />
      )}

      {/* Select checkbox OR drag handle */}
      {selectMode ? (
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${multiSelected ? 'bg-violet-500 border-violet-500 text-white' : 'border-gray-300 hover:border-violet-400'}`}>
          {multiSelected && <span className="text-[10px] font-bold">✓</span>}
        </div>
      ) : (
        <div {...(!dragDisabled ? { ...attributes, ...listeners } : {})}
          className={`flex-shrink-0 select-none ${dragDisabled ? 'text-gray-200 cursor-default' : 'text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing'}`}>
          ⠿
        </div>
      )}

      {/* Score badge */}
      <div className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0 ${SCORE_TIER_CLASSES[tier]}`}>
        {story.finalScore}
      </div>

      {/* Title */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{story.title}</div>
        {story.category && (
          <div className="text-xs text-gray-400 truncate">{story.category.name}</div>
        )}
      </div>

      {/* Committed badge */}
      {isCommitted && !selectMode && (
        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded flex-shrink-0">✓ committed</span>
      )}

      {/* Scope toggle — hidden in select mode */}
      {!selectMode && (
        <button
          onClick={(e) => { e.stopPropagation(); onUpdate(story.id, { inScope: !story.inScope }) }}
          className={`text-xs px-2 py-0.5 rounded border flex-shrink-0 transition-colors ${
            story.inScope
              ? 'bg-green-100 text-green-700 border-green-300'
              : 'bg-gray-100 text-gray-400 border-gray-300 hover:bg-gray-200'
          }`}
          title="Toggle in-scope"
        >
          {story.inScope ? 'In scope' : 'Out'}
        </button>
      )}

      {/* Status */}
      {!selectMode && (isActive ? (
        <span className="text-xs font-medium text-emerald-700 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
          Active
        </span>
      ) : (
        <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:block">{story.status}</span>
      ))}

      {/* Task count */}
      {!selectMode && story.tasks && story.tasks.length > 0 && (
        <span className="text-xs text-gray-400 flex-shrink-0">{story.tasks.filter(t => t.status === 'done').length}/{story.tasks.length}</span>
      )}

      {/* Convert type menu */}
      {!selectMode && onConvert && <ConvertMenu storyId={story.id} onConvert={onConvert} />}
    </div>
  )
}

// ── Story detail panel ────────────────────────────────────────────────────────

interface Dep { id: string; sourceId: string; targetId: string }

function StoryDetail({
  story,
  epics,
  features,
  workstreams,
  allStories,
  deps,
  onUpdate,
  onDelete,
  onClose,
  onConvert,
  onAddDep,
  onRemoveDep,
}: {
  story: UserStory
  epics: Epic[]
  features: Feature[]
  workstreams: Workstream[]
  allStories: UserStory[]
  deps: Dep[]
  onUpdate: (id: string, data: Partial<UserStory>) => void
  onDelete: (id: string) => void
  onClose: () => void
  onConvert: (id: string, to: 'epic' | 'feature') => void
  onAddDep: (targetId: string) => Promise<void>
  onRemoveDep: (depId: string) => Promise<void>
}) {
  const [title, setTitle] = useState(story.title)
  const [userStory, setUserStory] = useState(story.userStory)
  const [notes, setNotes] = useState(story.notes)
  const [dirty, setDirty] = useState(false)
  const [newTask, setNewTask] = useState('')
  const [addingTask, setAddingTask] = useState(false)
  const [addingDep, setAddingDep] = useState(false)
  const [depSearch, setDepSearch] = useState('')

  // deps where this story is the source (blocked-by)
  const blockedBy = deps.filter(d => d.sourceId === story.id)
  const blockedByIds = new Set(blockedBy.map(d => d.targetId))
  // deps where this story is the target (blocks others)
  const blocks = deps.filter(d => d.targetId === story.id)

  const depCandidates = allStories
    .filter(s => s.id !== story.id && !blockedByIds.has(s.id))
    .filter(s => {
      if (!depSearch.trim()) return true
      const term = depSearch.toLowerCase()
      const epicTitle = epics.find(e => e.id === s.epicId)?.title ?? ''
      const featureTitle = features.find(f => f.id === s.featureId)?.title ?? ''
      return s.title.toLowerCase().includes(term) || epicTitle.toLowerCase().includes(term) || featureTitle.toLowerCase().includes(term)
    })
    .slice(0, 12)

  useEffect(() => {
    setTitle(story.title)
    setUserStory(story.userStory)
    setNotes(story.notes)
    setDirty(false)
  }, [story.id])

  function markDirty() { setDirty(true) }

  async function save() {
    onUpdate(story.id, { title, userStory, notes })
    setDirty(false)
  }

  async function addTask() {
    if (!newTask.trim()) return
    await fetch(`/api/stories/${story.id}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTask.trim() }),
    })
    setNewTask('')
    setAddingTask(false)
    // Reload story
    const res = await fetch(`/api/projects/${story.projectId}/stories`)
    // Parent will handle refresh — trigger via onUpdate with no-op
    onUpdate(story.id, {})
  }

  async function cycleTaskStatus(taskId: string, current: string) {
    const next = current === 'todo' ? 'in-progress' : current === 'in-progress' ? 'done' : 'todo'
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    onUpdate(story.id, {})
  }

  const scoreField = (label: string, field: keyof UserStory) => (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            onClick={() => onUpdate(story.id, { [field]: v })}
            className={`w-7 h-7 rounded text-xs font-semibold transition-colors ${
              story[field] === v ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-start justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
        <div className="min-w-0 pr-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Story Detail</p>
          <p className="text-sm font-semibold text-gray-800 truncate mt-0.5">{story.title}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none shrink-0 mt-0.5">×</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Title */}
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); markDirty() }}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Scores */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-500 mb-1">Scoring</div>
          {scoreField('Value', 'valueScore')}
          {scoreField('Risk', 'riskScore')}
          {scoreField('Urgency', 'urgencyScore')}
          {scoreField('Effort (lower = better)', 'effortScore')}
          <div className="flex items-center justify-between pt-1 border-t border-gray-100">
            <span className="text-xs font-semibold text-gray-700">Final Score</span>
            <span className={`text-sm font-bold px-2 py-0.5 rounded ${SCORE_TIER_CLASSES[scoreTier(story.finalScore)]}`}>
              {story.finalScore}
            </span>
          </div>
        </div>

        {/* Meeting points */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Meeting Points</span>
          <div className="flex items-center gap-2">
            <button onClick={() => onUpdate(story.id, { meetingPoints: Math.max(0, story.meetingPoints - 1) })} className="w-7 h-7 bg-gray-100 rounded text-sm font-bold hover:bg-gray-200">−</button>
            <span className="text-sm font-semibold w-6 text-center">{story.meetingPoints}</span>
            <button onClick={() => onUpdate(story.id, { meetingPoints: story.meetingPoints + 1 })} className="w-7 h-7 bg-gray-100 rounded text-sm font-bold hover:bg-gray-200">+</button>
          </div>
        </div>

        {/* Status / Board */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Status</label>
            <select
              value={story.status}
              onChange={(e) => onUpdate(story.id, { status: e.target.value as UserStory['status'] })}
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {['backlog', 'active', 'done', 'archived'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Board</label>
            <select
              value={story.board}
              onChange={(e) => onUpdate(story.id, { board: e.target.value as UserStory['board'] })}
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {['Current Backlog', 'Discovery', 'Longer Term', 'UMQ', 'Marketing', 'Product', 'Complete'].map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Epic / Feature assignment */}
        {epics.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Epic</label>
              <select
                value={story.epicId ?? ''}
                onChange={e => onUpdate(story.id, { epicId: e.target.value || null })}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">— none —</option>
                {epics.map(ep => <option key={ep.id} value={ep.id}>{ep.title}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Feature</label>
              <select
                value={story.featureId ?? ''}
                onChange={e => onUpdate(story.id, { featureId: e.target.value || null })}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">— none —</option>
                {features
                  .filter(f => !story.epicId || f.epicId === story.epicId)
                  .map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Sprint scheduling */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-500 mb-1">Sprint scheduling</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Start week (FW 1–52)</label>
              <input
                type="number"
                min={1} max={52}
                value={story.sprintWeekStart ?? ''}
                onChange={e => onUpdate(story.id, { sprintWeekStart: e.target.value ? Number(e.target.value) : null })}
                placeholder="—"
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">End week (FW 1–52)</label>
              <input
                type="number"
                min={1} max={52}
                value={story.sprintWeekEnd ?? ''}
                onChange={e => onUpdate(story.id, { sprintWeekEnd: e.target.value ? Number(e.target.value) : null })}
                placeholder="—"
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          {workstreams.length > 0 && (
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Stream</label>
              <select
                value={story.sprintStream ?? ''}
                onChange={e => onUpdate(story.id, { sprintStream: e.target.value || null })}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">— unassigned —</option>
                {workstreams.map((ws, i) => (
                  <option key={ws.id} value={String(i)}>{ws.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* User story text */}
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">User Story</label>
          <textarea
            value={userStory}
            onChange={(e) => { setUserStory(e.target.value); markDirty() }}
            rows={3}
            placeholder="As a [user] I want [goal] so that [benefit]"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); markDirty() }}
            rows={4}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        {/* Dependencies */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-500">Blocked by</label>
            <button onClick={() => setAddingDep(v => !v)} className="text-xs text-amber-600 hover:text-amber-800">+ Add blocker</button>
          </div>
          {blockedBy.length > 0 && (
            <div className="space-y-1 mb-2">
              {blockedBy.map(dep => {
                const s = allStories.find(s => s.id === dep.targetId)
                return (
                  <div key={dep.id} className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    <span className="text-amber-600 font-mono">#{s?.rank ?? '?'}</span>
                    <span className="flex-1 text-gray-700 truncate">{s?.title ?? dep.targetId}</span>
                    <button onClick={() => onRemoveDep(dep.id)} className="text-gray-300 hover:text-red-500 shrink-0" title="Remove">×</button>
                  </div>
                )
              })}
            </div>
          )}
          {blocks.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">Blocks</p>
              <div className="space-y-1">
                {blocks.map(dep => {
                  const s = allStories.find(s => s.id === dep.sourceId)
                  return (
                    <div key={dep.id} className="flex items-center gap-2 text-xs bg-indigo-50 border border-indigo-100 rounded px-2 py-1">
                      <span className="text-indigo-500 font-mono">#{s?.rank ?? '?'}</span>
                      <span className="flex-1 text-gray-700 truncate">{s?.title ?? dep.sourceId}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {addingDep && (
            <div className="border border-amber-300 rounded-lg p-2 space-y-1.5 bg-amber-50">
              <input
                autoFocus
                value={depSearch}
                onChange={e => setDepSearch(e.target.value)}
                placeholder="Search stories…"
                className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                {depCandidates.length === 0 && <p className="text-xs text-gray-400 px-1">No matches</p>}
                {depCandidates.map(s => {
                  const epicTitle = epics.find(e => e.id === s.epicId)?.title
                  const featureTitle = features.find(f => f.id === s.featureId)?.title
                  return (
                    <button
                      key={s.id}
                      onClick={async () => { await onAddDep(s.id); setAddingDep(false); setDepSearch('') }}
                      className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-amber-100 flex items-start gap-2"
                    >
                      <span className="font-mono text-gray-400 shrink-0 mt-0.5">#{s.rank}</span>
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-gray-700">{s.title}</div>
                        {(epicTitle || featureTitle) && (
                          <div className="text-[10px] text-gray-400 truncate mt-0.5">
                            {epicTitle && <span className="text-indigo-400">{epicTitle}</span>}
                            {epicTitle && featureTitle && <span className="mx-1">›</span>}
                            {featureTitle && <span className="text-blue-400">{featureTitle}</span>}
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
              <button onClick={() => { setAddingDep(false); setDepSearch('') }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
            </div>
          )}
          {blockedBy.length === 0 && blocks.length === 0 && !addingDep && (
            <p className="text-xs text-gray-400 italic">No dependencies — add blockers to sequence work</p>
          )}
        </div>

        {/* Tasks */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-500">Tasks</label>
            <button onClick={() => setAddingTask(true)} className="text-xs text-indigo-600 hover:text-indigo-800">+ Add</button>
          </div>
          {addingTask && (
            <div className="flex gap-2 mb-2">
              <input
                autoFocus
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') setAddingTask(false) }}
                placeholder="Task title…"
                className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button onClick={addTask} className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700">Add</button>
            </div>
          )}
          <div className="space-y-1">
            {(story.tasks ?? []).map((task) => (
              <div key={task.id} className="flex items-center gap-2">
                <button
                  onClick={() => cycleTaskStatus(task.id, task.status)}
                  className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center text-xs transition-colors ${
                    task.status === 'done' ? 'bg-green-500 border-green-500 text-white' :
                    task.status === 'in-progress' ? 'bg-blue-500 border-blue-500 text-white' :
                    'border-gray-300 hover:border-gray-500'
                  }`}
                >
                  {task.status === 'done' ? '✓' : task.status === 'in-progress' ? '▶' : ''}
                </button>
                <span className={`text-xs flex-1 ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                  {task.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Promote / convert */}
      <div className="px-4 py-3 border-t border-gray-100 space-y-1.5">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">This item is actually a…</p>
        <div className="flex gap-2">
          <button
            onClick={() => { if (confirm('Convert to Feature? The story will be removed.')) onConvert(story.id, 'feature') }}
            className="flex-1 text-xs border border-blue-200 text-blue-700 hover:bg-blue-50 rounded-md py-1.5 font-medium flex items-center justify-center gap-1.5 transition-colors"
          >
            <span className="w-2 h-2 rounded-sm bg-blue-400" /> Feature
          </button>
          <button
            onClick={() => { if (confirm('Convert to Epic? The story will be removed.')) onConvert(story.id, 'epic') }}
            className="flex-1 text-xs border border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-md py-1.5 font-medium flex items-center justify-center gap-1.5 transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-indigo-400" /> Epic
          </button>
        </div>
      </div>

      {/* Footer actions */}
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex gap-2">
        {dirty && (
          <button onClick={save} className="bg-indigo-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-indigo-700">
            Save
          </button>
        )}
        <button
          onClick={() => { if (confirm('Delete this story?')) onDelete(story.id) }}
          className="ml-auto text-xs text-red-400 hover:text-red-600"
        >
          Delete story
        </button>
      </div>
    </div>
  )
}

// ── Epic / Feature detail panels ──────────────────────────────────────────────

function EpicDetail({ epic, onClose, onSave, onDelete }: {
  epic: Epic
  onClose: () => void
  onSave: (id: string, data: Partial<Epic>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [title, setTitle] = useState(epic.title)
  const [description, setDescription] = useState(epic.description ?? '')
  const [priority, setPriority] = useState(epic.priority)
  const [saving, setSaving] = useState(false)
  const dirty = title !== epic.title || description !== (epic.description ?? '') || priority !== epic.priority

  async function save() {
    setSaving(true)
    await onSave(epic.id, { title, description, priority })
    setSaving(false)
  }

  return (
    <div className="fixed right-4 top-[57px] bottom-4 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col z-30 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-indigo-50 shrink-0">
        <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 shrink-0" />
        <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Epic</span>
        <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Title</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={5}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Priority</label>
          <select
            value={priority}
            onChange={e => setPriority(e.target.value)}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            {['critical','high','medium','low'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex gap-2">
        {dirty && (
          <button onClick={save} disabled={saving} className="bg-indigo-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
        <button
          onClick={() => { if (confirm('Delete this epic? Stories inside will become unassigned.')) onDelete(epic.id) }}
          className="ml-auto text-xs text-red-400 hover:text-red-600"
        >
          Delete epic
        </button>
      </div>
    </div>
  )
}

function FeatureDetail({ feature, epics, onClose, onSave, onDelete }: {
  feature: Feature
  epics: Epic[]
  onClose: () => void
  onSave: (id: string, data: Partial<Feature>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [title, setTitle] = useState(feature.title)
  const [description, setDescription] = useState(feature.description ?? '')
  const [priority, setPriority] = useState(feature.priority)
  const [epicId, setEpicId] = useState(feature.epicId ?? '')
  const [saving, setSaving] = useState(false)
  const dirty = title !== feature.title || description !== (feature.description ?? '') || priority !== feature.priority || epicId !== (feature.epicId ?? '')

  async function save() {
    setSaving(true)
    await onSave(feature.id, { title, description, priority, epicId: epicId || null })
    setSaving(false)
  }

  return (
    <div className="fixed right-4 top-[57px] bottom-4 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col z-30 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-blue-50 shrink-0">
        <span className="w-2.5 h-2.5 rounded-sm bg-blue-400 shrink-0" />
        <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Feature</span>
        <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Title</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={5}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Priority</label>
          <select
            value={priority}
            onChange={e => setPriority(e.target.value)}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {['critical','high','medium','low'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Parent Epic</label>
          <select
            value={epicId}
            onChange={e => setEpicId(e.target.value)}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">— none —</option>
            {epics.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
        </div>
      </div>
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex gap-2">
        {dirty && (
          <button onClick={save} disabled={saving} className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
        <button
          onClick={() => { if (confirm('Delete this feature? Stories inside will become unassigned.')) onDelete(feature.id) }}
          className="ml-auto text-xs text-red-400 hover:text-red-600"
        >
          Delete feature
        </button>
      </div>
    </div>
  )
}

// ── Hierarchy view ─────────────────────────────────────────────────────────────

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden shrink-0">
        <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">{done}/{total}</span>
    </div>
  )
}

function InlineCreate({ placeholder, onAdd, onCancel }: { placeholder: string; onAdd: (title: string) => Promise<void>; onCancel: () => void }) {
  const [val, setVal] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit() {
    if (!val.trim() || saving) return
    setSaving(true)
    await onAdd(val.trim())
    setVal('')
    setSaving(false)
  }
  return (
    <div className="flex gap-2 items-center">
      <input
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
        placeholder={placeholder}
        className="flex-1 border border-indigo-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />
      <button onClick={submit} disabled={saving || !val.trim()} className="text-xs bg-indigo-600 text-white px-2.5 py-1 rounded hover:bg-indigo-700 disabled:opacity-50">Add</button>
      <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600 px-1">✕</button>
    </div>
  )
}

function FeatureSection({
  feature, epicId, stories, collapsed, addingStoryFor, draggingId, dropTarget,
  selected, onSelect, onUpdate, onConvert, onSelectFeature, onCreateStory,
  onToggle, onSetAddingStoryFor, onDropProps, onDragStartStory, onDragEndStory,
}: {
  feature: Feature | null
  epicId: string | null
  stories: UserStory[]
  collapsed: Set<string>
  addingStoryFor: { epicId: string | null; featureId: string | null } | null
  draggingId: string | null
  dropTarget: string | null
  selected: UserStory | null
  onSelect: (s: UserStory | null) => void
  onUpdate: (id: string, data: Partial<UserStory>) => void
  onConvert: (id: string, to: 'epic' | 'feature') => void
  onSelectFeature: (feature: Feature) => void
  onCreateStory: (epicId: string | null, featureId: string | null, title: string) => Promise<void>
  onToggle: (key: string) => void
  onSetAddingStoryFor: (v: { epicId: string | null; featureId: string | null } | null) => void
  onDropProps: (key: string, epicId: string | null, featureId: string | null) => Record<string, unknown>
  onDragStartStory: (id: string) => void
  onDragEndStory: () => void
}) {
  const fid = feature?.id ?? null
  const label = feature ? feature.title : 'No Feature'
  const sectionKey = `f:${fid ?? 'none'}:${epicId ?? 'none'}`
  const open = !collapsed.has(sectionKey)
  const ss = stories.filter(s => s.featureId === fid && s.epicId === epicId)
  const doneCount = ss.filter(s => s.status === 'done' || s.status === 'archived').length
  if (!feature && ss.length === 0 && addingStoryFor?.epicId !== epicId && addingStoryFor?.featureId !== null) return null

  const featureDropKey = `f:${fid ?? 'none'}:${epicId ?? 'none'}`
  const isFeatureDrop = dropTarget === featureDropKey && draggingId !== null

  return (
    <div className="pl-4 border-l-2 border-gray-100 ml-2 space-y-1">
      <div
        className={`flex items-center gap-2 py-1 group rounded transition-colors ${isFeatureDrop ? 'bg-blue-50 ring-1 ring-blue-300' : ''}`}
        {...(onDropProps(featureDropKey, epicId, fid) as React.HTMLAttributes<HTMLDivElement>)}
      >
        <button onClick={() => onToggle(sectionKey)} className="text-gray-300 hover:text-gray-500 text-xs w-4 shrink-0">
          {open ? '▾' : '▸'}
        </button>
        {feature
          ? <button onClick={() => onSelectFeature(feature)} className="text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline text-left">{label}</button>
          : <span className="text-xs font-semibold text-gray-400 italic">{label}</span>
        }
        {feature && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
            feature.priority === 'critical' ? 'bg-red-100 text-red-700' :
            feature.priority === 'high' ? 'bg-orange-100 text-orange-700' :
            'bg-gray-100 text-gray-400'}`}>
            {feature.priority}
          </span>
        )}
        {isFeatureDrop && <span className="text-[10px] text-blue-600 font-medium">Drop to assign</span>}
        <ProgressBar done={doneCount} total={ss.length} />
        <button
          onClick={() => onSetAddingStoryFor({ epicId, featureId: fid })}
          className="ml-auto text-[10px] text-gray-300 hover:text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          + story
        </button>
      </div>
      {open && (
        <div className="pl-2 space-y-1">
          {ss.map(s => (
            <div
              key={s.id}
              draggable
              onDragStart={() => onDragStartStory(s.id)}
              onDragEnd={onDragEndStory}
              className="cursor-grab active:cursor-grabbing"
            >
              <StoryRow
                story={s}
                selected={selected?.id === s.id}
                onSelect={() => onSelect(selected?.id === s.id ? null : s)}
                onUpdate={onUpdate}
                onConvert={onConvert}
                dragDisabled
              />
            </div>
          ))}
          {addingStoryFor?.epicId === epicId && addingStoryFor?.featureId === fid && (
            <InlineCreate
              placeholder="Story title…"
              onAdd={t => onCreateStory(epicId, fid, t)}
              onCancel={() => onSetAddingStoryFor(null)}
            />
          )}
        </div>
      )}
    </div>
  )
}

function HierarchyView({
  epics,
  features,
  stories,
  selected,
  onSelect,
  onUpdate,
  onCreateEpic,
  onCreateFeature,
  onCreateStory,
  onConvert,
  onSelectEpic,
  onSelectFeature,
}: {
  epics: Epic[]
  features: Feature[]
  stories: UserStory[]
  selected: UserStory | null
  onSelect: (s: UserStory | null) => void
  onUpdate: (id: string, data: Partial<UserStory>) => void
  onCreateEpic: (title: string) => Promise<void>
  onCreateFeature: (epicId: string | null, title: string) => Promise<void>
  onCreateStory: (epicId: string | null, featureId: string | null, title: string) => Promise<void>
  onConvert: (id: string, to: 'epic' | 'feature') => void
  onSelectEpic: (epic: Epic) => void
  onSelectFeature: (feature: Feature) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [addingEpic, setAddingEpic] = useState(false)
  const [addingFeatureFor, setAddingFeatureFor] = useState<string | null | false>(false)
  const [addingStoryFor, setAddingStoryFor] = useState<{ epicId: string | null; featureId: string | null } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const draggingIdRef = useRef<string | null>(null)

  function toggle(id: string) {
    setCollapsed(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  // Always applied — not gated on draggingId state so onDragOver fires immediately
  function dropProps(targetKey: string, epicId: string | null, featureId: string | null) {
    return {
      onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDropTarget(targetKey) },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null)
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault()
        setDropTarget(null)
        const id = draggingIdRef.current
        if (id) onUpdate(id, { epicId, featureId })
      },
    }
  }

  const doneCount = (ss: UserStory[]) => ss.filter(s => s.status === 'done' || s.status === 'archived').length

  const featureSectionProps = {
    stories,
    collapsed,
    addingStoryFor,
    draggingId,
    dropTarget,
    selected,
    onSelect,
    onUpdate,
    onConvert,
    onSelectFeature,
    onCreateStory,
    onToggle: toggle,
    onSetAddingStoryFor: setAddingStoryFor,
    onDropProps: dropProps,
    onDragStartStory: (id: string) => { draggingIdRef.current = id; setDraggingId(id) },
    onDragEndStory: () => { draggingIdRef.current = null; setDraggingId(null); setDropTarget(null) },
  }

  return (
    <div className="space-y-3">
      {epics.map(epic => {
        const epicOpen = !collapsed.has(`e:${epic.id}`)
        const epicFeatures = features.filter(f => f.epicId === epic.id)
        const epicStories = stories.filter(s => s.epicId === epic.id)
        const epicDone = doneCount(epicStories)

        const epicDropKey = `e:${epic.id}`
        const isEpicDrop = dropTarget === epicDropKey && draggingId !== null

        return (
          <div key={epic.id} className={`bg-white border rounded-lg overflow-hidden transition-all ${isEpicDrop ? 'border-indigo-400 shadow-md shadow-indigo-100' : 'border-gray-200'}`}>
            {/* Epic header — droppable */}
            <div
              className={`flex items-center gap-2 px-3 py-2.5 border-b border-gray-200 group transition-colors ${isEpicDrop ? 'bg-indigo-50' : 'bg-gray-50'}`}
              {...dropProps(epicDropKey, epic.id, null)}
            >
              <button onClick={() => toggle(`e:${epic.id}`)} className="text-gray-400 hover:text-gray-600 text-xs w-4 shrink-0">
                {epicOpen ? '▾' : '▸'}
              </button>
              <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
              <button onClick={() => onSelectEpic(epic)} className="text-sm font-semibold text-gray-800 hover:text-indigo-700 hover:underline text-left">{epic.title}</button>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                epic.priority === 'critical' ? 'bg-red-100 text-red-700' :
                epic.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                'bg-gray-100 text-gray-500'}`}>
                {epic.priority}
              </span>
              {isEpicDrop
                ? <span className="text-xs text-indigo-600 font-medium">Drop to assign to epic</span>
                : <ProgressBar done={epicDone} total={epicStories.length} />}
              <button
                onClick={() => setAddingFeatureFor(epic.id)}
                className="ml-auto text-[10px] text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                + feature
              </button>
              <button
                onClick={() => setAddingStoryFor({ epicId: epic.id, featureId: null })}
                className="text-[10px] text-gray-300 hover:text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                + story
              </button>
            </div>

            {/* Epic body */}
            {epicOpen && (
              <div className="px-2 py-2 space-y-2">
                {epicFeatures.map(f => <FeatureSection key={f.id} feature={f} epicId={epic.id} {...featureSectionProps} />)}
                <FeatureSection feature={null} epicId={epic.id} {...featureSectionProps} />
                {addingFeatureFor === epic.id && (
                  <div className="pl-6">
                    <InlineCreate
                      placeholder="Feature title…"
                      onAdd={t => onCreateFeature(epic.id, t)}
                      onCancel={() => setAddingFeatureFor(false)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Stories with no epic */}
      {(() => {
        const unassigned = stories.filter(s => s.epicId === null)
        if (unassigned.length === 0 && addingStoryFor?.epicId !== null) return null
        return (
          <div className="bg-white border border-dashed border-gray-300 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50/50 border-b border-gray-200 group">
              <button onClick={() => toggle('e:none')} className="text-gray-300 hover:text-gray-500 text-xs w-4 shrink-0">
                {!collapsed.has('e:none') ? '▾' : '▸'}
              </button>
              <span className="text-sm font-semibold text-gray-400 italic">No Epic</span>
              <ProgressBar done={doneCount(unassigned)} total={unassigned.length} />
              <button
                onClick={() => setAddingStoryFor({ epicId: null, featureId: null })}
                className="ml-auto text-[10px] text-gray-300 hover:text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                + story
              </button>
            </div>
            {!collapsed.has('e:none') && (
              <div className="px-3 py-2 space-y-1">
                {unassigned.map(s => (
                  <div
                    key={s.id}
                    draggable
                    onDragStart={() => setDraggingId(s.id)}
                    onDragEnd={() => { setDraggingId(null); setDropTarget(null) }}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    <StoryRow
                      story={s}
                      selected={selected?.id === s.id}
                      onSelect={() => onSelect(selected?.id === s.id ? null : s)}
                      onUpdate={onUpdate}
                      onConvert={onConvert}
                      dragDisabled
                    />
                  </div>
                ))}
                {addingStoryFor?.epicId === null && addingStoryFor?.featureId === null && (
                  <InlineCreate
                    placeholder="Story title…"
                    onAdd={t => onCreateStory(null, null, t)}
                    onCancel={() => setAddingStoryFor(null)}
                  />
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* Add epic */}
      {addingEpic ? (
        <InlineCreate
          placeholder="Epic title…"
          onAdd={t => onCreateEpic(t)}
          onCancel={() => setAddingEpic(false)}
        />
      ) : (
        <button
          onClick={() => setAddingEpic(true)}
          className="w-full text-xs text-gray-400 hover:text-indigo-600 border border-dashed border-gray-200 hover:border-indigo-300 rounded-lg py-2 transition-colors"
        >
          + Add epic
        </button>
      )}
    </div>
  )
}

// ── Empty board state ─────────────────────────────────────────────────────────

function EmptyBoard({ projectId, projectName, epics }: {
  projectId: string
  projectName: string
  epics: Epic[]
}) {
  const hasEpics = epics.length > 0
  return (
    <div className="py-10 space-y-6">
      <div className="text-center space-y-3">
        <p className="text-sm font-semibold text-gray-700">No stories yet</p>
        <p className="text-xs text-gray-400 max-w-sm mx-auto">
          {hasEpics
            ? 'Your epics are set up — add stories manually using the + Story button.'
            : 'Add stories manually using the + Story button above.'}
        </p>
      </div>
      {hasEpics && (
        <div className="max-w-lg mx-auto">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 text-center">
            {epics.length} epics ready
          </p>
          <div className="space-y-1.5">
            {epics.map(epic => (
              <div key={epic.id} className="flex items-center gap-2.5 bg-white border border-gray-100 rounded-lg px-3 py-2">
                <span className="w-2 h-2 rounded-full bg-indigo-300 shrink-0" />
                <span className="text-sm text-gray-700 font-medium">{epic.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
// ── Board page ────────────────────────────────────────────────────────────────

export default function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params)
  const [project, setProject] = useState<Project | null>(null)
  const [stories, setStories] = useState<UserStory[]>([])
  const [epics, setEpics] = useState<Epic[]>([])
  const [features, setFeatures] = useState<Feature[]>([])
  const [workstreams, setWorkstreams] = useState<Workstream[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<UserStory | null>(null)
  const [showNewStory, setShowNewStory] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [filterInScope, setFilterInScope] = useState(false)
  const [sortMode, setSortMode] = useState<'manual' | 'score'>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem('board-sort-mode') as 'manual' | 'score') ?? 'manual'
    return 'manual'
  })
  const [viewMode, setViewMode] = useState<'flat' | 'hierarchy'>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem('board-view-mode') as 'flat' | 'hierarchy') ?? 'flat'
    return 'flat'
  })
  const [showFreshModal, setShowFreshModal] = useState(false)
  const [snapshotName, setSnapshotName] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deps, setDeps] = useState<Dep[]>([])
  const [search, setSearch] = useState('')
  const [selectedEpic, setSelectedEpic] = useState<Epic | null>(null)
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null)

  function toggleSortMode() {
    setSortMode(prev => {
      const next = prev === 'manual' ? 'score' : 'manual'
      localStorage.setItem('board-sort-mode', next)
      return next
    })
  }

  function setViewModeAndSave(m: 'flat' | 'hierarchy') {
    localStorage.setItem('board-view-mode', m)
    setViewMode(m)
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const loadData = useCallback(async () => {
    const [projRes, storiesRes, epicsRes, featuresRes, depsRes, wsRes] = await Promise.all([
      fetch(`/api/projects/${projectId}`, { cache: 'no-store' }),
      fetch(`/api/projects/${projectId}/stories`, { cache: 'no-store' }),
      fetch(`/api/projects/${projectId}/epics`, { cache: 'no-store' }),
      fetch(`/api/projects/${projectId}/features`, { cache: 'no-store' }),
      fetch(`/api/projects/${projectId}/dependencies`, { cache: 'no-store' }),
      fetch(`/api/projects/${projectId}/workstreams`, { cache: 'no-store' }),
    ])
    const [proj, storyList, epicList, featureList, depList, wsList] = await Promise.all([
      projRes.json(), storiesRes.json(),
      epicsRes.ok ? epicsRes.json() : [],
      featuresRes.ok ? featuresRes.json() : [],
      depsRes.ok ? depsRes.json() : [],
      wsRes.ok ? wsRes.json() : [],
    ])
    setProject(proj)
    setStories(storyList)
    setEpics(Array.isArray(epicList) ? epicList : [])
    setFeatures(Array.isArray(featureList) ? featureList : [])
    setDeps(Array.isArray(depList) ? depList : [])
    setWorkstreams(Array.isArray(wsList) ? wsList : [])
    setLoading(false)
  }, [projectId])

  useEffect(() => { loadData() }, [loadData])



  // Keep selected story in sync after updates
  useEffect(() => {
    if (selected) {
      const updated = stories.find((s) => s.id === selected.id)
      if (updated) setSelected(updated)
    }
  }, [stories])

  async function handleUpdate(id: string, data: Partial<UserStory>) {
    if (Object.keys(data).length > 0) {
      await fetch(`/api/stories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    }
    await loadData()
  }

  async function handleDelete(id: string) {
    await fetch(`/api/stories/${id}`, { method: 'DELETE' })
    setSelected(null)
    await loadData()
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    await fetch(`/api/projects/${projectId}/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim() }),
    })
    setNewTitle('')
    setShowNewStory(false)
    await loadData()
  }

  async function handleSaveEpic(id: string, data: Partial<Epic>) {
    await fetch(`/api/epics/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    setSelectedEpic(prev => prev?.id === id ? { ...prev, ...data } : prev)
    await loadData()
  }

  async function handleDeleteEpic(id: string) {
    await fetch(`/api/epics/${id}`, { method: 'DELETE' })
    setSelectedEpic(null)
    await loadData()
  }

  async function handleSaveFeature(id: string, data: Partial<Feature>) {
    await fetch(`/api/features/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    setSelectedFeature(prev => prev?.id === id ? { ...prev, ...data } : prev)
    await loadData()
  }

  async function handleDeleteFeature(id: string) {
    await fetch(`/api/features/${id}`, { method: 'DELETE' })
    setSelectedFeature(null)
    await loadData()
  }

  async function handleCreateEpic(title: string) {
    await fetch(`/api/projects/${projectId}/epics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    await loadData()
  }

  async function handleCreateFeature(epicId: string | null, title: string) {
    await fetch(`/api/projects/${projectId}/features`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, epicId }),
    })
    await loadData()
  }

  async function handleCreateHierarchyStory(epicId: string | null, featureId: string | null, title: string) {
    await fetch(`/api/projects/${projectId}/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, epicId, featureId }),
    })
    await loadData()
  }

  async function handleConvert(storyId: string, to: 'epic' | 'feature') {
    const story = stories.find(s => s.id === storyId)
    if (!story) return
    if (to === 'epic') {
      await fetch(`/api/projects/${projectId}/epics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: story.title, description: story.userStory || story.notes || '' }),
      })
    } else {
      await fetch(`/api/projects/${projectId}/features`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: story.title, description: story.userStory || '', epicId: story.epicId }),
      })
    }
    await fetch(`/api/stories/${storyId}`, { method: 'DELETE' })
    setSelected(null)
    await loadData()
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = stories.findIndex((s) => s.id === active.id)
    const newIndex = stories.findIndex((s) => s.id === over.id)
    const reordered = arrayMove(stories, oldIndex, newIndex)
    setStories(reordered)
    await fetch('/api/stories/rerank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: reordered.map((s) => s.id) }),
    })
  }

  async function handleStartFresh() {
    if (!snapshotName.trim()) return
    await fetch(`/api/projects/${projectId}/start-fresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshotName: snapshotName.trim(), carryForward: ['workstreams', 'categories', 'personas'] }),
    })
    setShowFreshModal(false)
    setSnapshotName('')
    setSelected(null)
    await loadData()
  }

  async function handleAddDep(targetId: string) {
    if (!selected) return
    await fetch(`/api/projects/${projectId}/dependencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: selected.id, targetId }),
    })
    await loadData()
  }

  async function handleRemoveDep(depId: string) {
    await fetch(`/api/dependencies/${depId}`, { method: 'DELETE' })
    await loadData()
  }

  function toggleSelectMode() {
    setSelectMode(v => !v)
    setSelectedIds(new Set())
  }

  function toggleStorySelection(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }


  const searchTerm = search.trim().toLowerCase()
  const filtered = stories
    .filter(s => !filterInScope || s.inScope)
    .filter(s => !searchTerm || s.title.toLowerCase().includes(searchTerm))
  const displayed = sortMode === 'score'
    ? [...filtered].sort((a, b) => b.finalScore - a.finalScore)
    : filtered
  const inScopeCount = stories.filter((s) => s.inScope).length
  const totalScore = stories.filter((s) => s.inScope).reduce((sum, s) => sum + s.finalScore, 0)

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Loading…</div>

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 text-white px-6 py-3 flex items-center gap-4">
        <Link href="/" className="text-slate-400 hover:text-white text-sm">← Projects</Link>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: project?.color }} />
          <span className="font-semibold text-sm">{project?.name}</span>
        </div>
        <nav className="flex items-center gap-1 ml-2">
          <span className="px-3 py-1 rounded text-sm font-medium bg-white/10">Board</span>
          <Link href={`/projects/${projectId}/personas`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors">Team</Link>
          <Link href={`/projects/${projectId}/sprint`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors">Sprint</Link>
                    <Link href={`/projects/${projectId}/archive`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors">Archive</Link>
          <Link href={`/projects/${projectId}/critical-path`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors">Critical Path</Link>
          <Link href={`/projects/${projectId}/documents`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors">Docs</Link>
          <Link href={`/projects/${projectId}/triage`} className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors">Triage</Link>
                  </nav>
        <div className="flex-1" />
        <a
          href={`/api/projects/${projectId}/exports/ado`}
          className="text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded transition-colors"
          title="Download committed items as Azure DevOps CSV"
        >
          ↓ ADO Export
        </a>
        <button
          onClick={() => setShowFreshModal(true)}
          className="text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded transition-colors"
        >
          Start Fresh
        </button>
        <UserNav />
      </header>


      {/* Start Fresh modal */}
      {showFreshModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowFreshModal(false)}>
          <div className="bg-white rounded-lg p-6 shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-gray-900 mb-1">Start Fresh</h2>
            <p className="text-sm text-gray-500 mb-4">
              This will save a snapshot of the current board and clear all stories, epics, features, and tasks.
              Workstreams, categories, and persona placements will be kept.
            </p>
            <div className="mb-4">
              <label className="text-xs font-medium text-gray-600 block mb-1">Snapshot name</label>
              <input
                autoFocus
                value={snapshotName}
                onChange={(e) => setSnapshotName(e.target.value)}
                placeholder={`Snapshot ${new Date().toLocaleDateString()}`}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleStartFresh}
                disabled={!snapshotName.trim()}
                className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                Save &amp; Clear
              </button>
              <button onClick={() => setShowFreshModal(false)} className="text-gray-500 px-4 py-2 text-sm hover:text-gray-700">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden relative">
        {/* Story list — always full width; floating panel overlays */}
        <div className="flex flex-col w-full transition-all">

          {/* Toolbar */}
          <div className="px-4 py-3 bg-white border-b border-gray-200 flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">⌕</span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search stories…"
                className="pl-7 pr-7 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 w-48"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-600 text-xs">✕</button>
              )}
            </div>
            <div className="text-sm text-gray-600">
              <span className="font-semibold">{searchTerm ? `${filtered.length} of ${stories.length}` : stories.length}</span> stories
              {inScopeCount > 0 && (
                <span className="ml-2 text-indigo-600 font-medium">· {inScopeCount} in scope (score {totalScore})</span>
              )}
            </div>
            {/* View toggle */}
            <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
              <button
                onClick={() => setViewModeAndSave('flat')}
                className={`px-2.5 py-1 font-medium transition-colors ${viewMode === 'flat' ? 'bg-slate-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                title="Flat list"
              >
                ≡ Flat
              </button>
              <button
                onClick={() => setViewModeAndSave('hierarchy')}
                className={`px-2.5 py-1 font-medium transition-colors ${viewMode === 'hierarchy' ? 'bg-slate-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                title="Epic → Feature → Story hierarchy"
              >
                ◫ Hierarchy
              </button>
            </div>
            {/* Sort toggle — only in flat mode */}
            {viewMode === 'flat' && (
              <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
                <button
                  onClick={() => { setSortMode('manual'); localStorage.setItem('board-sort-mode', 'manual') }}
                  className={`px-2.5 py-1 font-medium transition-colors flex items-center gap-1 ${sortMode === 'manual' ? 'bg-slate-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  title="Manual order — drag to reorder"
                >
                  ⠿ Manual
                </button>
                <button
                  onClick={() => { setSortMode('score'); localStorage.setItem('board-sort-mode', 'score') }}
                  className={`px-2.5 py-1 font-medium transition-colors flex items-center gap-1 ${sortMode === 'score' ? 'bg-slate-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  title="Sort by final score (highest first)"
                >
                  ↓ Score
                </button>
              </div>
            )}
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer ml-auto">
              <input type="checkbox" checked={filterInScope} onChange={(e) => setFilterInScope(e.target.checked)} className="rounded" />
              In-scope only
            </label>
            {viewMode === 'flat' && (
              <button
                onClick={() => setShowNewStory(true)}
                className="bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-indigo-700"
              >
                + Story
              </button>
            )}
          </div>

          {/* New story form (flat mode) */}
          {viewMode === 'flat' && showNewStory && (
            <form onSubmit={handleCreate} className="px-4 py-3 bg-indigo-50 border-b border-indigo-200 flex gap-2">
              <input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Story title…"
                className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                onKeyDown={(e) => e.key === 'Escape' && setShowNewStory(false)}
              />
              <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm hover:bg-indigo-700">Add</button>
              <button type="button" onClick={() => setShowNewStory(false)} className="text-gray-400 text-sm px-2 hover:text-gray-600">✕</button>
            </form>
          )}

          {/* Stories / Hierarchy */}
          <div className={`flex-1 overflow-y-auto py-3 space-y-2 transition-all ${(selected || selectedEpic || selectedFeature) ? 'px-4 pr-[26rem]' : 'px-4'}`}>
            {viewMode === 'hierarchy' ? (
              <HierarchyView
                epics={epics}
                features={features}
                stories={filtered}
                selected={selected}
                onSelect={s => { setSelected(s); setSelectedEpic(null); setSelectedFeature(null) }}
                onUpdate={handleUpdate}
                onCreateEpic={handleCreateEpic}
                onCreateFeature={handleCreateFeature}
                onCreateStory={handleCreateHierarchyStory}
                onConvert={handleConvert}
                onSelectEpic={e => { setSelectedEpic(e); setSelectedFeature(null); setSelected(null) }}
                onSelectFeature={f => { setSelectedFeature(f); setSelectedEpic(null); setSelected(null) }}
              />
            ) : displayed.length === 0 ? (
              filterInScope ? (
                <div className="text-center py-16 text-gray-400 text-sm">No in-scope stories.</div>
              ) : (
                <EmptyBoard projectId={projectId} projectName={project?.name ?? ''} epics={epics} />
              )
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={sortMode === 'manual' ? handleDragEnd : () => {}}>
                <SortableContext items={displayed.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  {displayed.map((story) => (
                    <StoryRow
                      key={story.id}
                      story={story}
                      selected={selected?.id === story.id}
                      onSelect={() => setSelected(selected?.id === story.id ? null : story)}
                      onUpdate={handleUpdate}
                      onConvert={handleConvert}
                      dragDisabled={sortMode === 'score'}
                      selectMode={selectMode}
                      multiSelected={selectedIds.has(story.id)}
                      onMultiSelect={toggleStorySelection}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>

        {/* Floating detail panel */}
        {selected && (
          <div className="fixed right-4 top-[57px] bottom-4 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col z-30 overflow-hidden">
            <StoryDetail
              story={selected}
              epics={epics}
              features={features}
              workstreams={workstreams}
              allStories={stories}
              deps={deps}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onClose={() => setSelected(null)}
              onConvert={handleConvert}
              onAddDep={handleAddDep}
              onRemoveDep={handleRemoveDep}
            />
          </div>
        )}
        {selectedEpic && (
          <EpicDetail
            epic={selectedEpic}
            onClose={() => setSelectedEpic(null)}
            onSave={handleSaveEpic}
            onDelete={handleDeleteEpic}
          />
        )}
        {selectedFeature && (
          <FeatureDetail
            feature={selectedFeature}
            epics={epics}
            onClose={() => setSelectedFeature(null)}
            onSave={handleSaveFeature}
            onDelete={handleDeleteFeature}
          />
        )}
      </div>
    </div>
  )
}
