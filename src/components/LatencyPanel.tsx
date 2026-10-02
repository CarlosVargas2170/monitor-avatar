import type { LatencyStats } from '../types'

function Sparkline({ stats }: { stats: LatencyStats }) {
  const pts = stats.samples
  if (pts.length < 2) {
    return <div className="spark-empty">midiendo…</div>
  }
  const w = 100
  const h = 32
  const max = Math.max(...pts.map((p) => p.ms), 1)
  const min = 0
  const span = max - min || 1
  const step = w / (pts.length - 1)
  const line = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(2)},${(h - ((p.ms - min) / span) * h).toFixed(2)}`)
    .join(' ')

  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={line} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {pts.map((p, i) =>
        p.ok ? null : (
          <circle
            key={i}
            cx={i * step}
            cy={h - ((p.ms - min) / span) * h}
            r={1.6}
            fill="#f87171"
          />
        ),
      )}
    </svg>
  )
}

function fmt(ms: number | null): string {
  if (ms == null) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`
}

// Latencia HTTPS al servidor de Gemini, muestreada en continuo por el backend.
export function LatencyPanel({ stats }: { stats: LatencyStats }) {
  const down = stats.samples.length > 0 && !stats.ok
  return (
    <section className="panel latency-panel">
      <div className="panel-head">
        <h2>Latencia Gemini</h2>
        <span className={`badge ${down ? 'badge-off' : stats.current != null ? 'badge-ok' : ''}`}>
          {down ? 'sin respuesta' : fmt(stats.current)}
        </span>
      </div>
      <div className={`spark-wrap ${down ? 'is-down' : ''}`}>
        <Sparkline stats={stats} />
      </div>
      <div className="latency-grid">
        <div>
          <span className="k">actual</span>
          <span className="v">{fmt(stats.current)}</span>
        </div>
        <div>
          <span className="k">promedio</span>
          <span className="v">{fmt(stats.avg)}</span>
        </div>
        <div>
          <span className="k">p95</span>
          <span className="v">{fmt(stats.p95)}</span>
        </div>
        <div>
          <span className="k">mín / máx</span>
          <span className="v">
            {fmt(stats.min)} / {fmt(stats.max)}
          </span>
        </div>
      </div>
    </section>
  )
}
