import { useCallback, useRef, useState } from 'react'
import type {
  AvatarState,
  SessionCardData,
  SessionEvent,
  Turn,
} from '../types'

let turnSeq = 0
const nextTurnId = () => `t${Date.now()}-${turnSeq++}`

function participantOf(event: SessionEvent): {
  identityId: string | null
  displayName: string
  isKnown: boolean
} {
  const p = (event.payload['participant'] ?? {}) as Record<string, unknown>
  return {
    identityId: (p['identity_id'] as string) ?? null,
    displayName: (p['display_name'] as string) || 'Visitante',
    isKnown: Boolean(p['is_known']),
  }
}

function seedTurns(event: SessionEvent, at: number): Turn[] {
  const messages = event.payload['messages']
  if (!Array.isArray(messages)) return []
  const turns: Turn[] = []
  for (const raw of messages) {
    const m = raw as Record<string, unknown>
    const role = m['role']
    const text = (m['content'] as string) ?? ''
    if (!text) continue
    if (role === 'user') turns.push({ id: nextTurnId(), speaker: 'user', text, at, partial: false })
    else if (role === 'assistant')
      turns.push({ id: nextTurnId(), speaker: 'ai', text, at, partial: false })
  }
  return turns
}

// Cierra el turno abierto de un hablante (o de todos) para que el siguiente
// fragmento empiece un mensaje nuevo.
function finalizeOpen(turns: Turn[], speaker?: 'user' | 'ai'): Turn[] {
  let changed = false
  const next = turns.map((t) => {
    if (t.partial && (!speaker || t.speaker === speaker)) {
      changed = true
      return { ...t, partial: false }
    }
    return t
  })
  return changed ? next : turns
}

function appendTranscript(
  turns: Turn[],
  speaker: 'user' | 'ai',
  text: string,
  isFinal: boolean,
  at: number,
): Turn[] {
  // El otro hablante tomó la palabra: su turno previo queda cerrado.
  const other: 'user' | 'ai' = speaker === 'user' ? 'ai' : 'user'
  const next = finalizeOpen(turns, other).slice()

  const openIdx = next.findIndex((t) => t.speaker === speaker && t.partial)
  if (text) {
    if (openIdx >= 0) {
      next[openIdx] = { ...next[openIdx], text: next[openIdx].text + text, at }
    } else {
      next.push({ id: nextTurnId(), speaker, text, at, partial: true })
    }
  }
  if (isFinal) {
    const idx = next.findIndex((t) => t.speaker === speaker && t.partial)
    if (idx >= 0) next[idx] = { ...next[idx], partial: false }
  }
  return next
}

// Reconstruye el estado de cada sesión a partir del flujo de eventos.
// Regla central: la tarjeta NO se borra cuando la persona sale de cámara;
// pasa a "away" y vuelve a "active" si el runtime emite experience_resumed.
export function useSessionFeed() {
  const [sessions, setSessions] = useState<SessionCardData[]>([])
  const seen = useRef<Set<string>>(new Set())

  const ingest = useCallback((event: SessionEvent) => {
    if (!event || typeof event.event_type !== 'string' || !event.session_id) return

    const key = `${event.event_type}|${event.session_id}|${event.timestamp ?? ''}`
    if (event.timestamp) {
      if (seen.current.has(key)) return
      seen.current.add(key)
      if (seen.current.size > 400) seen.current = new Set([...seen.current].slice(-200))
    }

    const at = Date.parse(event.timestamp ?? '') || Date.now()

    setSessions((prev) => {
      const map = new Map(prev.map((s) => [s.sessionId, s]))
      const id = event.session_id
      const current: SessionCardData =
        map.get(id) ??
        {
          sessionId: id,
          identityId: null,
          displayName: 'Visitante',
          isKnown: false,
          status: 'active',
          avatarState: 'idle',
          startedAt: at,
          lastEventAt: at,
          turns: [],
          pending: false,
          waitStartedAt: null,
          lastLatencyMs: null,
          lastResponseMs: null,
        }

      let updated: SessionCardData = { ...current, lastEventAt: at }

      switch (event.event_type) {
        case 'experience_started':
        case 'experience_resumed': {
          const p = participantOf(event)
          updated = {
            ...updated,
            identityId: p.identityId,
            displayName: p.displayName,
            isKnown: p.isKnown,
            status: 'active',
            startedAt: current.turns.length ? current.startedAt : at,
          }
          if (!current.turns.length) updated.turns = seedTurns(event, at)
          break
        }
        case 'person_left':
          updated.status = updated.status === 'ended' ? 'ended' : 'away'
          updated.turns = finalizeOpen(current.turns)
          updated.pending = false
          updated.waitStartedAt = null
          break
        case 'experience_ended':
          updated.status = 'ended'
          updated.avatarState = 'idle'
          updated.turns = finalizeOpen(current.turns)
          updated.pending = false
          updated.waitStartedAt = null
          break
        case 'avatar_state': {
          const state = (event.payload['state'] as AvatarState) ?? 'idle'
          updated.avatarState = state
          if (state === 'thinking' && !current.pending) {
            updated.pending = true
            updated.waitStartedAt = at
          } else if (state === 'speaking' && current.pending) {
            updated.pending = false
            if (current.waitStartedAt != null && current.lastLatencyMs == null) {
              updated.lastLatencyMs = at - current.waitStartedAt
            }
          }
          // Si el avatar dejó de hablar, cierra su mensaje abierto.
          if (state !== 'speaking') updated.turns = finalizeOpen(current.turns, 'ai')
          break
        }
        case 'user_transcript': {
          const text = (event.payload['text'] as string) ?? ''
          const isFinal = Boolean(event.payload['is_final'])
          updated.turns = appendTranscript(current.turns, 'user', text, isFinal, at)
          if (isFinal && text) {
            // Empieza a contar: el usuario terminó, esperamos a Gemini.
            updated.pending = true
            updated.waitStartedAt = at
            updated.lastLatencyMs = null
            updated.lastResponseMs = null
          }
          break
        }
        case 'ai_transcript': {
          const text = (event.payload['text'] as string) ?? ''
          updated.turns = appendTranscript(
            current.turns,
            'ai',
            text,
            Boolean(event.payload['is_final']),
            at,
          )
          // Primer token de Gemini: fin de la espera, registra la latencia.
          if (text && current.pending) {
            updated.pending = false
            if (current.waitStartedAt != null) {
              updated.lastLatencyMs = at - current.waitStartedAt
            }
          }
          break
        }
        case 'ai_stream_end':
        case 'ai_interrupted': {
          // Fin del turno del asistente (Gemini Live): cierra su mensaje para
          // que la próxima respuesta sea un mensaje aparte.
          let turns = finalizeOpen(current.turns, 'ai')
          const transcript = (event.payload['transcript'] as string) ?? ''
          const hadAi = current.turns.some((t) => t.speaker === 'ai' && t.partial)
          if (!hadAi && transcript) {
            turns = [
              ...turns,
              { id: nextTurnId(), speaker: 'ai', text: transcript, at, partial: false },
            ]
          }
          updated.turns = turns
          updated.avatarState = 'idle'
          if (current.waitStartedAt != null && event.event_type === 'ai_stream_end') {
            updated.lastResponseMs = at - current.waitStartedAt
            if (current.lastLatencyMs == null) {
              updated.lastLatencyMs = at - current.waitStartedAt
            }
          }
          updated.pending = false
          updated.waitStartedAt = null
          break
        }
        case 'ai_message': {
          const text = (event.payload['text'] as string) ?? ''
          const hasOpenAi = current.turns.some((t) => t.speaker === 'ai' && t.partial)
          const lastAi = [...current.turns].reverse().find((t) => t.speaker === 'ai')
          if (text && !hasOpenAi && lastAi?.text !== text) {
            updated.turns = [
              ...current.turns,
              { id: nextTurnId(), speaker: 'ai', text, at, partial: false },
            ]
          } else if (hasOpenAi) {
            updated.turns = current.turns.map((t) =>
              t.speaker === 'ai' && t.partial ? { ...t, partial: false } : t,
            )
          }
          break
        }
        default:
          if (map.has(id)) return prev // evento irrelevante para una sesión conocida
      }

      map.set(id, updated)
      return [...map.values()].sort((a, b) => b.lastEventAt - a.lastEventAt)
    })
  }, [])

  return { sessions, ingest }
}
