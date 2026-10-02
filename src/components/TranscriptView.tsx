import { useEffect, useRef } from 'react'
import type { SessionCardData } from '../types'
import { PendingIndicator } from './PendingIndicator'

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function TranscriptView({ session }: { session: SessionCardData | null }) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [session?.turns])

  return (
    <section className="panel transcript">
      <div className="panel-head">
        <h2>Conversación {session ? `· ${session.displayName}` : ''}</h2>
        {session && <span className="avatar-state">{session.avatarState}</span>}
      </div>
      {session && (
        <div className="transcript-status">
          <PendingIndicator session={session} />
        </div>
      )}
      <div className="transcript-scroll">
        {!session && <p className="muted">Selecciona una sesión.</p>}
        {session && session.turns.length === 0 && (
          <p className="muted">Aún no hay diálogo.</p>
        )}
        {session?.turns.map((turn) => (
          <div key={turn.id} className={`turn turn-${turn.speaker}`}>
            <div className="turn-head">
              <span className="turn-who">
                {turn.speaker === 'user' ? 'Usuario' : 'Gemini'}
              </span>
              <span className="turn-time">{clock(turn.at)}</span>
            </div>
            <p className={turn.partial ? 'turn-text is-partial' : 'turn-text'}>
              {turn.text}
              {turn.partial && <span className="caret">▍</span>}
            </p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </section>
  )
}
