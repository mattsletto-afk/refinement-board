import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getAdr } from '@/src/domain/adr/adrService'
import AdrStatusForm from './AdrStatusForm'

type Props = { params: Promise<{ id: string }> }

function formatAdrNumber(n: number): string {
  return `ADR-${String(n).padStart(3, '0')}`
}

export default async function AdrDetailPage({ params }: Props) {
  const { id } = await params
  const adr = await getAdr(id)

  if (!adr) {
    notFound()
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-6">
        <Link
          href="/adrs"
          className="text-sm text-blue-600 hover:underline"
        >
          ← All ADRs
        </Link>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <span className="text-sm font-mono text-gray-500">
              {formatAdrNumber(adr.number)}
            </span>
            <h1 className="text-xl font-bold text-gray-900 mt-1">{adr.title}</h1>
          </div>
          <AdrStatusForm adrId={adr.id} currentStatus={adr.status} />
        </div>

        <div className="space-y-6">
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Context
            </h2>
            <p className="text-gray-800 whitespace-pre-wrap">{adr.context}</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Decision
            </h2>
            <p className="text-gray-800 whitespace-pre-wrap">{adr.decision}</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Consequences
            </h2>
            <p className="text-gray-800 whitespace-pre-wrap">
              {adr.consequences}
            </p>
          </section>

          <div className="text-xs text-gray-400 pt-4 border-t border-gray-100">
            Created {new Date(adr.createdAt).toLocaleString()}
            {adr.storyId && (
              <span className="ml-4">Story: {adr.storyId}</span>
            )}
            {adr.agentRunId && (
              <span className="ml-4">Run: {adr.agentRunId}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
