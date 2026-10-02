import { useEffect, useState } from 'react'
import type { SessionCardData } from '../types'

// Muestra "esperando a Gemini… X s" mientras el turno está pendiente (contador
// en vivo), y la latencia de la última respuesta cuando ya llegó.
export function PendingIndicator({
  session,
  compact = false,
}: {
  session: SessionCardData
  compact?: boolean
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!session.pending) return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [session.pending])

  if (session.pending && session.waitStartedAt != null) {
    const elapsed = Math.max(0, now - session.waitStartedAt) / 1000
    return (
      <span className="pending">
        <span className="spinner" />
        {compact ? `${elapsed.toFixed(1)} s` : `esperando a Gemini… ${elapsed.toFixed(1)} s`}
      </span>
    )
  }

  if (session.lastLatencyMs != null) {
    const first = (session.lastLatencyMs / 1000).toFixed(2)
    const total =
      session.lastResponseMs != null ? (session.lastResponseMs / 1000).toFixed(2) : null
    return (
      <span className="latency">
        {compact
          ? `${first} s`
          : `Gemini respondió · 1er token ${first} s${total ? ` · total ${total} s` : ''}`}
      </span>
    )
  }

  return null
}
