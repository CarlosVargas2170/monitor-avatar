import type { VideoState } from '../hooks/useMonitorFeed'

// El backend ya dibuja las cajas y nombres sobre el JPEG; aquí sólo se muestra.
export function CameraPanel({ video }: { video: VideoState }) {
  const live = video.fps > 0 && video.dataUri
  return (
    <section className="panel camera-panel">
      <div className="panel-head">
        <h2>Cámara</h2>
        <span className={`badge ${live ? 'badge-ok' : 'badge-off'}`}>
          {live ? `${video.fps.toFixed(1)} fps` : 'sin señal'}
        </span>
      </div>
      <div className="camera-frame">
        {video.dataUri ? (
          <img src={video.dataUri} alt="cámara del tótem" />
        ) : (
          <div className="camera-empty">Esperando frames del MonitorHub…</div>
        )}
      </div>
      <div className="camera-caption">
        {video.tracks.length === 0
          ? 'Sin rostros en cuadro'
          : video.tracks
              .map((t) => t.name || (t.interaction_id ? 'Visitante' : 'rostro'))
              .join(' · ')}
      </div>
    </section>
  )
}
