import Link from 'next/link'
import { listAdrs } from '@/src/domain/adr/adrService'
import type { AdrRecord } from '@/src/domain/adr/types'

function statusBadgeClass(status: string): string {
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

function formatAdrNumber(n: number): string {
  return `ADR-${String(n).padStart(3, '0')}`
}

export default async function AdrsPage() {
  const adrs: AdrRecord[] = await listAdrs()

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Architecture Decision Records
        </h1>
        <Link
          href="/adrs/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Generate ADR
        </Link>
      </div>

      {adrs.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg">No ADRs yet.</p>
          <p className="text-sm mt-1">
            Generate one from an architecture decision.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {adrs.map((adr) => (
            <Link
              key={adr.id}
              href={`/adrs/${adr.id}`}
              className="block p-5 bg-white border border-gray-200 rounded-lg hover:border-blue-400 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-gray-500">
                      {formatAdrNumber(adr.number)}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadgeClass(adr.status)}`}
                    >
                      {adr.status}
                    </span>
                  </div>
                  <h2 className="text-base font-semibold text-gray-900 truncate">
                    {adr.title}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                    {adr.context}
                  </p>
                </div>
                <time className="text-xs text-gray-400 whitespace-nowrap">
                  {new Date(adr.createdAt).toLocaleDateString()}
                </time>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
