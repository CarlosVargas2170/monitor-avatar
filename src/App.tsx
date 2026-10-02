import { useCallback, useMemo, useState } from 'react'
import './App.css'
import { config } from './config'
import { useReconnectingSocket } from './hooks/useReconnectingSocket'
import { useSessionFeed } from './hooks/useSessionFeed'
import { useMonitorFeed } from './hooks/useMonitorFeed'
import { useAudioSink } from './hooks/useAudioSink'
import { ConnectionBar } from './components/ConnectionBar'
import { CameraPanel } from './components/CameraPanel'
import { LatencyPanel } from './components/LatencyPanel'
import { SessionList } from './components/SessionList'
import { TranscriptView } from './components/TranscriptView'
import { AudioControls } from './components/AudioControls'
import { BeamStatusPanel } from './components/BeamStatusPanel'
import { SpatiusAlertsPanel } from './components/SpatiusAlertsPanel'
import type { SessionEvent } from './types'

export default function App() {
  const { sessions, ingest } = useSessionFeed()
  const sink = useAudioSink()
  // Selección explícita del operador; si está vacía o es obsoleta, se cae a la
  // primera sesión en curso (calculado en render, sin efecto).
  const [pickedId, setPickedId] = useState<string | null>(null)

  const handleSessionEvent = useCallback(
    (event: SessionEvent) => {
      ingest(event)
      sink.pushSessionEvent(event)
    },
    [ingest, sink],
  )

  // WebSocket de experiencia (mensajes crudos, sin envoltorio).
  const sessionStatus = useReconnectingSocket(
    config.sessionWsUrl,
    useCallback(
      (data: unknown) => handleSessionEvent(data as SessionEvent),
      [handleSessionEvent],
    ),
  )

  // MonitorHub: video + audio de micrófono + eco de eventos de sesión.
  const { status: monitorStatus, video, latency, beamSpeakers, spatiusAlerts } = useMonitorFeed(
    config.monitorWsUrl,
    sink.pushUserAudio,
    handleSessionEvent,
  )

  const selectedId = useMemo(() => {
    if (pickedId && sessions.some((s) => s.sessionId === pickedId)) return pickedId
    return (sessions.find((s) => s.status !== 'ended') ?? sessions[0])?.sessionId ?? null
  }, [sessions, pickedId])

  const selected = useMemo(
    () => sessions.find((s) => s.sessionId === selectedId) ?? null,
    [sessions, selectedId],
  )

  return (
    <div className="app">
      <ConnectionBar sessionStatus={sessionStatus} monitorStatus={monitorStatus} />
      <main className="layout">
        <div className="col col-left">
          <CameraPanel video={video} />
          <LatencyPanel stats={latency} />
          <BeamStatusPanel speakers={beamSpeakers} />
          <SpatiusAlertsPanel alerts={spatiusAlerts} />
          <AudioControls sink={sink} />
        </div>
        <div className="col col-right">
          <SessionList
            sessions={sessions}
            selectedId={selectedId}
            onSelect={setPickedId}
          />
          <TranscriptView session={selected} />
        </div>
      </main>
    </div>
  )
}
