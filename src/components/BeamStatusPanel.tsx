import type { BeamSpeaker } from '../types'

const BEAM_LABEL: Record<0 | 1, string> = { 0: 'Beam 0 (izquierda)', 1: 'Beam 1 (derecha)' }

/**
 * Muestra el ángulo/confianza que face-recognition-totem-backend calculó
 * para cada beam del XVF3800 en vivo (evento `beam_speakers`). Es la
 * segunda señal de verificación además de escuchar los canales en
 * "Audio en vivo": si el ángulo coincide con la posición real de la
 * persona, el cálculo está bien — independiente de si el hardware ya está
 * fijando el beam ahí de verdad.
 */
export function BeamStatusPanel({ speakers }: { speakers: BeamSpeaker[] }) {
  if (speakers.length === 0) {
    return (
      <section className="panel beam-status">
        <div className="panel-head">
          <h2>Beam XVF3800</h2>
        </div>
        <p className="muted small">Sin interlocutores activos — beams apagados (escaneo automático).</p>
      </section>
    )
  }

  return (
    <section className="panel beam-status">
      <div className="panel-head">
        <h2>Beam XVF3800</h2>
      </div>
      {([0, 1] as const).map((beamIndex) => {
        const speaker = speakers.find((s) => s.beam_index === beamIndex)
        return (
          <div key={beamIndex} className="beam-row">
            <span className="beam-row-label">{BEAM_LABEL[beamIndex]}</span>
            {speaker ? (
              <span className="beam-row-value">
                {speaker.person_id ?? 'sin identificar'} · az {speaker.azimuth_deg.toFixed(1)}° · el{' '}
                {speaker.elevation_deg.toFixed(1)}° · conf {(speaker.confidence * 100).toFixed(0)}%
              </span>
            ) : (
              <span className="beam-row-value muted">duplicado del beam 0</span>
            )}
          </div>
        )
      })}
    </section>
  )
}
