'use client'

export interface ScoreTrendRow {
  date:          string
  agentType:     string
  avgEfficiency: number
  runCount:      number
  itemsCreated:  number
  itemsReworked: number
  itemsRejected: number
}

interface ScoreTrendChartProps {
  rows:      ScoreTrendRow[]
  projectId: string
  days:      number
}

/**
 * ScoreTrendChart
 * Renders a simple HTML table showing score trends by date and agent type.
 * Includes an inline SVG sparkline for efficiency scores.
 */
export function ScoreTrendChart({ rows, projectId, days }: ScoreTrendChartProps) {
  if (rows.length === 0) {
    return (
      <div style={{ padding: '1rem', color: '#888' }}>
        No score data found for project <strong>{projectId}</strong> in the last {days} days.
      </div>
    )
  }

  // Build sparkline for efficiency scores
  const scores = rows.map((r) => r.avgEfficiency)
  const maxScore = Math.max(...scores, 1)
  const minScore = Math.min(...scores, 0)
  const range = maxScore - minScore || 1
  const W = 120
  const H = 30
  const pts = scores
    .map((s, i) => {
      const x = (i / Math.max(scores.length - 1, 1)) * W
      const y = H - ((s - minScore) / range) * H
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: '14px' }}>
      <h3>Score Trends — Last {days} days</h3>

      {scores.length > 1 && (
        <div style={{ marginBottom: '1rem' }}>
          <svg width={W} height={H} style={{ border: '1px solid #eee', borderRadius: 4 }}>
            <polyline points={pts} fill="none" stroke="#4f6bed" strokeWidth={2} />
          </svg>
          <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>Efficiency sparkline</div>
        </div>
      )}

      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr style={{ background: '#f5f5f5' }}>
            <th style={th}>Date</th>
            <th style={th}>Agent Type</th>
            <th style={th}>Avg Efficiency</th>
            <th style={th}>Runs</th>
            <th style={th}>Created</th>
            <th style={th}>Reworked</th>
            <th style={th}>Rejected</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={td}>{row.date}</td>
              <td style={td}>{row.agentType}</td>
              <td style={{ ...td, color: scoreColor(row.avgEfficiency) }}>
                {row.avgEfficiency.toFixed(2)}
              </td>
              <td style={td}>{row.runCount}</td>
              <td style={td}>{row.itemsCreated}</td>
              <td style={td}>{row.itemsReworked}</td>
              <td style={td}>{row.itemsRejected}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const th: React.CSSProperties = {
  padding: '6px 10px',
  textAlign: 'left',
  borderBottom: '2px solid #ddd',
  fontWeight: 600,
}

const td: React.CSSProperties = {
  padding: '6px 10px',
  borderBottom: '1px solid #eee',
}

function scoreColor(score: number): string {
  if (score >= 0.8) return '#16a34a'
  if (score >= 0.5) return '#ca8a04'
  return '#dc2626'
}
