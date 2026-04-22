import { Suspense } from 'react'
import { KpiDashboard } from './KpiDashboard'

export default function KpiPage() {
  return (
    <main className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">KPI Dashboard</h1>
      <Suspense fallback={<div>Loading scores…</div>}>
        <KpiDashboard />
      </Suspense>
    </main>
  )
}
