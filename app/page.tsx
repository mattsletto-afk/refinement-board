'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import type { Project } from '@/src/domain/types'

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  archived: 'bg-gray-100 text-gray-500',
  template: 'bg-purple-100 text-purple-800',
}

export default function HomePage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then(setProjects)
      .finally(() => setLoading(false))
  }, [])

  const active = projects.filter((p) => p.status === 'active')
  const archived = projects.filter((p) => p.status !== 'active')

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white px-6 py-3 flex items-center gap-6">
        <span className="font-black text-lg tracking-tight">Refinement Board</span>
        <nav className="flex items-center gap-1 ml-2">
          <span className="px-3 py-1 rounded text-sm font-medium bg-white/10">Projects</span>
          <Link href="/personas" className="px-3 py-1 rounded text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
            Personas
          </Link>
        </nav>
        <div className="flex-1" />
        <button
          onClick={() => router.push('/projects/new')}
          className="bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          + New Project
        </button>
        <UserButton />
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">

        {loading ? (
          <div className="text-sm text-gray-400 py-12 text-center">Loading…</div>
        ) : (
          <>
            <section className="mb-10">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Active Projects</h2>
              {active.length === 0 ? (
                <div className="text-sm text-gray-400 bg-white border border-dashed border-gray-300 rounded-lg p-10 text-center">
                  No active projects. Create one to get started.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {active.map((p) => <ProjectCard key={p.id} project={p} />)}
                </div>
              )}
            </section>

            {archived.length > 0 && (
              <section>
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Archived</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {archived.map((p) => <ProjectCard key={p.id} project={p} />)}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
          <h3 className="font-semibold text-gray-900 text-sm truncate">{project.name}</h3>
        </div>
        <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[project.status]}`}>
          {project.status}
        </span>
      </div>
      {project.description && (
        <p className="text-xs text-gray-500 mb-3 line-clamp-2 ml-5">{project.description}</p>
      )}
      <div className="flex gap-3 mt-3 ml-5">
        <Link href={`/projects/${project.id}/board`} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
          Board →
        </Link>
        <Link href={`/projects/${project.id}/archive`} className="text-xs text-gray-400 hover:text-gray-600">
          Archive
        </Link>
      </div>
    </div>
  )
}
