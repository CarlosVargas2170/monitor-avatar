import type { AudioSink, ChannelControls } from '../hooks/useAudioSink'

function Channel({ title, hint, ch }: { title: string; hint: string; ch: ChannelControls }) {
  return (
    <div className="audio-channel">
      <div className="audio-channel-head">
        <span className={`level ${ch.active && !ch.muted ? 'is-active' : ''}`} />
        <span className="audio-title">{title}</span>
        <button
          type="button"
          className={`mute ${ch.muted ? 'is-muted' : ''}`}
          onClick={() => ch.setMuted(!ch.muted)}
        >
          {ch.muted ? 'silenciado' : 'sonando'}
        </button>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.02}
        value={ch.volume}
        onChange={(e) => ch.setVolume(Number(e.target.value))}
      />
      <span className="muted small">{hint}</span>
    </div>
  )
}

export function AudioControls({ sink }: { sink: AudioSink }) {
  const [slot0, slot1] = sink.micChannels
  // slot1 solo se muestra una vez que el beam steering del XVF3800 aísla a
  // una segunda persona — antes de eso (o sin esa feature activa) todo el
  // audio del mic entra por slot0, igual que el único canal de antes.
  const showSecondMic = slot1.key !== null

  return (
    <section className="panel audio-controls">
      <div className="panel-head">
        <h2>Audio en vivo</h2>
        {!sink.started && (
          <button type="button" className="primary" onClick={() => void sink.start()}>
            Activar audio
          </button>
        )}
      </div>
      {sink.started ? (
        <>
          <Channel
            title={slot0.label}
            hint="entrada desde avatar-frontend · 16 kHz"
            ch={slot0.ch}
          />
          {showSecondMic && (
            <Channel title={slot1.label} hint="segundo beam del XVF3800 · 16 kHz" ch={slot1.ch} />
          )}
          <Channel title="Voz de la IA" hint="salida de Gemini / TTS · 24 kHz" ch={sink.ai} />
        </>
      ) : (
        <p className="muted">
          El navegador exige un clic para reproducir audio. Pulsa «Activar audio».
        </p>
      )}
    </section>
  )
}
