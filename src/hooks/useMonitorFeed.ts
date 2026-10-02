import { useCallback, useEffect, useRef, useState } from 'react'
import { useReconnectingSocket } from './useReconnectingSocket'
import type {
  BeamSpeaker,
  LatencySample,
  LatencyStats,
  MonitorMessage,
  SessionEvent,
  SocketStatus,
  SpatiusAlert,
  TrackBox,
} from '../types'

export interface VideoState {
  dataUri: string | null
  tracks: TrackBox[]
  fps: number
  lastFrameAt: number
}

interface MonitorFeed {
  status: SocketStatus
  video: VideoState
  latency: LatencyStats
  beamSpeakers: BeamSpeaker[]
  spatiusAlerts: SpatiusAlert[]
}

const MAX_SAMPLES = 120
const MAX_SPATIUS_ALERTS = 30

function computeStats(samples: LatencySample[]): LatencyStats {
  const oks = samples.filter((s) => s.ok).map((s) => s.ms)
  const last = samples[samples.length - 1] ?? null
  if (oks.length === 0) {
    return {
      samples,
      current: last?.ms ?? null,
      ok: last?.ok ?? false,
      avg: null,
      p95: null,
      min: null,
      max: null,
    }
  }
  const sorted = [...oks].sort((a, b) => a - b)
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
  return {
    samples,
    current: last?.ms ?? null,
    ok: last?.ok ?? false,
    avg: oks.reduce((a, b) => a + b, 0) / oks.length,
    p95,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  }
}

// Consume el MonitorHub: video anotado + audio de micrófono + eco de eventos
// de sesión (por si el WebSocket de experiencia no está disponible).
export function useMonitorFeed(
  url: string,
  onUserAudio: (pcmB64: string, sampleRate: number, personId: string | null) => void,
  onSessionEvent: (event: SessionEvent) => void,
): MonitorFeed {
  const [video, setVideo] = useState<VideoState>({
    dataUri: null,
    tracks: [],
    fps: 0,
    lastFrameAt: 0,
  })
  const [latency, setLatency] = useState<LatencyStats>(() => computeStats([]))
  const [beamSpeakers, setBeamSpeakers] = useState<BeamSpeaker[]>([])
  const [spatiusAlerts, setSpatiusAlerts] = useState<SpatiusAlert[]>([])
  const frameTimes = useRef<number[]>([])
  const audioCb = useRef(onUserAudio)
  const eventCb = useRef(onSessionEvent)
  useEffect(() => {
    audioCb.current = onUserAudio
    eventCb.current = onSessionEvent
  })

  const handle = useCallback((data: unknown) => {
    const msg = data as MonitorMessage
    if (!msg || typeof msg.type !== 'string') return

    if (msg.type === 'video_frame') {
      const now = performance.now()
      const times = frameTimes.current
      times.push(now)
      while (times.length && now - times[0] > 2000) times.shift()
      const fps =
        times.length > 1 ? (times.length - 1) / ((now - times[0]) / 1000) : 0
      setVideo({
        dataUri: `data:image/jpeg;base64,${msg.jpeg_b64}`,
        tracks: msg.tracks ?? [],
        fps: Math.round(fps * 10) / 10,
        lastFrameAt: Date.now(),
      })
    } else if (msg.type === 'user_audio') {
      audioCb.current(msg.pcm_b64, msg.sample_rate, msg.person_id ?? null)
    } else if (msg.type === 'session_event') {
      if (msg.event_type === 'beam_speakers') {
        const speakers = msg.payload['speakers']
        setBeamSpeakers(Array.isArray(speakers) ? (speakers as BeamSpeaker[]) : [])
      }
      eventCb.current(msg)
    } else if (msg.type === 'spatius_alert') {
      setSpatiusAlerts((prev) =>
        [
          ...prev,
          {
            id: `${msg.session_id}-${msg.ts}`,
            sessionId: msg.session_id,
            error: msg.error,
            audioPlayed: msg.audio_played,
            at: Date.now(),
          },
        ].slice(-MAX_SPATIUS_ALERTS),
      )
    } else if (msg.type === 'gemini_latency') {
      setLatency((prev) => {
        const next = [
          ...prev.samples,
          { ms: msg.ms, ok: msg.ok, at: Date.now() },
        ].slice(-MAX_SAMPLES)
        return computeStats(next)
      })
    }
  }, [])

  const status = useReconnectingSocket(url, handle)

  // Marca "sin señal" si dejan de llegar frames.
  useEffect(() => {
    const id = setInterval(() => {
      setVideo((v) =>
        v.lastFrameAt && Date.now() - v.lastFrameAt > 2000 && v.fps !== 0
          ? { ...v, fps: 0 }
          : v,
      )
    }, 1000)
    return () => clearInterval(id)
  }, [])

  return { status, video, latency, beamSpeakers, spatiusAlerts }
}
