import type { SocketStatus } from '../types'

const LABELS: Record<SocketStatus, string> = {
  open: 'conectado',
  connecting: 'conectando…',
  closed: 'sin conexión',
}

function Dot({ status }: { status: SocketStatus }) {
  return <span className={`dot dot-${status}`} />
}

export function ConnectionBar({
  sessionStatus,
  monitorStatus,
}: {
  sessionStatus: SocketStatus
  monitorStatus: SocketStatus
}) {
  return (
    <header className="connection-bar">
      <strong>monitor-avatar</strong>
      <span className="conn">
        <Dot status={monitorStatus} /> MonitorHub (8767): {LABELS[monitorStatus]}
      </span>
      <span className="conn">
        <Dot status={sessionStatus} /> Experiencia (8765): {LABELS[sessionStatus]}
      </span>
    </header>
  )
}
