export type SocketStatus = 'connecting' | 'open' | 'closed'

// Evento de experiencia tal como lo emite el WebSocket del runtime.
export interface SessionEvent {
  event_type: string
  session_id: string
  payload: Record<string, unknown>
  timestamp?: string
}

export interface TrackBox {
  bbox: [number, number, number, number]
  name: string | null
  identity_id: string | null
  interaction_id: string | null
}

export interface VideoFrameMessage {
  type: 'video_frame'
  jpeg_b64: string
  tracks: TrackBox[]
  ts: string
}

export interface UserAudioMessage {
  type: 'user_audio'
  session_id: string
  // Sólo presente con el direccionamiento de beam del XVF3800 activo (ver
  // face-recognition-totem-backend/app/audio_beam/) — a qué persona
  // apuntaba el beam que capturó este chunk. null antes de esa feature o
  // sin nadie identificado.
  person_id: string | null
  pcm_b64: string
  sample_rate: number
  ts: string
}

// XVF3800 beam steering — ver face-recognition-totem-backend/app/audio_beam/
export interface BeamSpeaker {
  beam_index: 0 | 1
  person_id: string | null
  azimuth_deg: number
  elevation_deg: number
  confidence: number
}

export interface SessionEventMessage extends SessionEvent {
  type: 'session_event'
}

export interface GeminiLatencyMessage {
  type: 'gemini_latency'
  ms: number
  ok: boolean
  status: number
  ts: string
}

// avatar-backend no pudo conectar con Spatius para un turno — ver
// avatar-backend/turns.py (_dispatch_to_spatius) y
// face-recognition-totem-backend/app/experience/monitor/hub.py
// (on_spatius_alert). El audio/texto de ese turno se reprodujo igual
// (flujo desacoplado a propósito); sólo el avatar se quedó quieto.
export interface SpatiusAlertMessage {
  type: 'spatius_alert'
  session_id: string
  error: string
  audio_played: boolean
  ts: string
}

export type MonitorMessage =
  | VideoFrameMessage
  | UserAudioMessage
  | SessionEventMessage
  | GeminiLatencyMessage
  | SpatiusAlertMessage

export interface SpatiusAlert {
  id: string
  sessionId: string
  error: string
  audioPlayed: boolean
  at: number
}

export interface LatencySample {
  ms: number
  ok: boolean
  at: number
}

export interface LatencyStats {
  samples: LatencySample[]
  current: number | null
  ok: boolean
  avg: number | null
  p95: number | null
  min: number | null
  max: number | null
}

export type SessionStatus = 'active' | 'away' | 'ended'
export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking'

export interface Turn {
  id: string
  speaker: 'user' | 'ai'
  text: string
  at: number
  partial: boolean
}

export interface SessionCardData {
  sessionId: string
  identityId: string | null
  displayName: string
  isKnown: boolean
  status: SessionStatus
  avatarState: AvatarState
  startedAt: number
  lastEventAt: number
  turns: Turn[]
  // Latencia de respuesta de Gemini.
  pending: boolean // esperando a que Gemini empiece a responder
  waitStartedAt: number | null // epoch ms en que empezó la espera
  lastLatencyMs: number | null // ms hasta el primer token de la última respuesta
  lastResponseMs: number | null // ms de la última respuesta completa
}
