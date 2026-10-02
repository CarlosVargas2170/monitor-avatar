import type { SpatiusAlert } from '../types'

/**
 * Alertas de "avatar-backend no pudo hablar con Spatius para este turno".
 * El flujo sigue igual (el audio se reproduce, la conversación no se
 * interrumpe) — esto es puramente informativo para que un operador note un
 * patrón (varias alertas seguidas) antes de que un visitante se queje de
 * que el avatar dejó de moverse. Ver avatar-backend/turns.py
 * (_dispatch_to_spatius) y MonitorHub.on_spatius_alert.
 */
export function SpatiusAlertsPanel({ alerts }: { alerts: SpatiusAlert[] }) {
  const recent = [...alerts].reverse()

  return (
    <section className="panel spatius-alerts">
      <div className="panel-head">
        <h2>Alertas Spatius</h2>
        {alerts.length > 0 && <span className="badge badge-warn">{alerts.length}</span>}
      </div>
      {recent.length === 0 ? (
        <p className="muted small">Sin fallos de Spatius — el avatar se ha movido con normalidad.</p>
      ) : (
        <ul className="spatius-alerts-list">
          {recent.map((alert) => (
            <li key={alert.id} className="spatius-alert-row">
              <div className="spatius-alert-row-head">
                <span className="spatius-alert-time">
                  {new Date(alert.at).toLocaleTimeString()}
                </span>
                <span className={alert.audioPlayed ? 'badge badge-ok' : 'badge badge-danger'}>
                  {alert.audioPlayed ? 'audio sí sonó' : 'audio no confirmado'}
                </span>
              </div>
              <div className="spatius-alert-session muted small">sesión {alert.sessionId}</div>
              <div className="spatius-alert-error small">{alert.error}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
