import type { SessionCardData, SessionStatus } from '../types'
import { PendingIndicator } from './PendingIndicator'

const STATUS_LABEL: Record<SessionStatus, string> = {
  active: 'activa',
  away: 'fuera de cámara',
  ended: 'finalizada',
}

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function SessionCard({
  session,
  selected,
  onSelect,
}: {
  session: SessionCardData
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`session-card ${selected ? 'is-selected' : ''} status-${session.status}`}
      onClick={onSelect}
    >
      <div className="session-card-top">
        <span className="session-name">{session.displayName}</span>
        <span className={`badge ${session.isKnown ? 'badge-known' : 'badge-guest'}`}>
          {session.isKnown ? 'conocido' : 'visitante'}
        </span>
      </div>
      <div className="session-card-meta">
        <span className={`status-pill status-${session.status}`}>
          {STATUS_LABEL[session.status]}
        </span>
        <span className="avatar-state">{session.avatarState}</span>
        <PendingIndicator session={session} compact />
      </div>
      <div className="session-card-times">
        <span>inicio {clock(session.startedAt)}</span>
        <span>últ. actividad {clock(session.lastEventAt)}</span>
      </div>
    </button>
  )
}

export function SessionList({
  sessions,
  selectedId,
  onSelect,
}: {
  sessions: SessionCardData[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const live = sessions.filter((s) => s.status !== 'ended')
  const ended = sessions.filter((s) => s.status === 'ended')

  return (
    <section className="panel session-list">
      <div className="panel-head">
        <h2>Sesiones</h2>
        <span className="badge">{live.length} en curso</span>
      </div>
      <div className="session-scroll">
        {sessions.length === 0 && (
          <p className="muted">Sin sesiones todavía.</p>
        )}
        {live.map((s) => (
          <SessionCard
            key={s.sessionId}
            session={s}
            selected={s.sessionId === selectedId}
            onSelect={() => onSelect(s.sessionId)}
          />
        ))}
        {ended.length > 0 && <div className="session-divider">Finalizadas</div>}
        {ended.map((s) => (
          <SessionCard
            key={s.sessionId}
            session={s}
            selected={s.sessionId === selectedId}
            onSelect={() => onSelect(s.sessionId)}
          />
        ))}
      </div>
    </section>
  )
}
