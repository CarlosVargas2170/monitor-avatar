import { useEffect, useMemo, useState } from 'react'
import { config } from './config'

/** One event of /debug/audio-tap?channel=trace. */
interface TraceEvent {
  ts: number
  stage: 'browser' | 'to_llm' | 'from_llm' | 'classifier' | 'puppet'
  event: string
  box?: string | null
  dropped?: string
  buffered?: string
  audio_bytes?: number
  delta?: string
  text?: string
  transcription?: string
  mode?: string
  reason?: string
}

interface Turn {
  id: number
  userStartAt: number
  userLastAudioAt: number
  userText: string
  receivedChunks: number
  droppedChunks: Record<string, number>
  sentChunks: number
  bufferedChunks: number
  firstSentAt: number | null
  classifierText: string
  classifierDoneAt: number | null
  box: string | null
  responseStartedAt: number | null
  firstTextAt: number | null
  firstAudioAt: number | null
  lastAudioAt: number | null
  audioBytes: number
  replyText: string
  endedAt: number | null
  endKind: string | null
  puppetAt: number | null
  puppetResult: string | null
}

const MAX_EVENTS = 3000

function newTurn(id: number, ts: number): Turn {
  return {
    id,
    userStartAt: ts,
    userLastAudioAt: ts,
    userText: '',
    receivedChunks: 0,
    droppedChunks: {},
    sentChunks: 0,
    bufferedChunks: 0,
    firstSentAt: null,
    classifierText: '',
    classifierDoneAt: null,
    box: null,
    responseStartedAt: null,
    firstTextAt: null,
    firstAudioAt: null,
    lastAudioAt: null,
    audioBytes: 0,
    replyText: '',
    endedAt: null,
    endKind: null,
    puppetAt: null,
    puppetResult: null,
  }
}

/** Groups the flat event stream into turns: a turn opens with the user's first accepted audio/text after the previous reply started. */
function buildTurns(events: TraceEvent[]): Turn[] {
  const turns: Turn[] = []
  const last = () => turns[turns.length - 1]

  for (const e of events) {
    if (e.stage === 'browser') {
      const isInput = e.event === 'input.audio' || e.event === 'input.text'
      let t = last()
      if (e.dropped) {
        // Audio descartado mientras el avatar habla: pertenece a la respuesta en curso.
        if (t) t.droppedChunks[e.dropped] = (t.droppedChunks[e.dropped] ?? 0) + 1
        continue
      }
      if (!isInput && e.event !== 'input.audio.end') continue
      if (!t || t.responseStartedAt !== null) {
        t = newTurn(turns.length + 1, e.ts)
        turns.push(t)
      }
      if (isInput) {
        t.receivedChunks += 1
        t.userLastAudioAt = e.ts
      }
      if (e.event === 'input.text' && e.text) t.userText += e.text
      continue
    }

    const t = last()
    if (!t) continue
    if (e.box) t.box = e.box

    if (e.stage === 'to_llm' && e.event === 'input.audio') {
      if (e.dropped) t.droppedChunks[e.dropped] = (t.droppedChunks[e.dropped] ?? 0) + 1
      else if (e.buffered) t.bufferedChunks += 1
      else {
        t.sentChunks += 1
        t.firstSentAt ??= e.ts
      }
    } else if (e.stage === 'classifier') {
      if (e.event === 'response.text.delta' && e.delta) t.classifierText += e.delta
      if (e.event === 'response.completed') t.classifierDoneAt = e.ts
    } else if (e.stage === 'from_llm') {
      if (e.event === 'conversation.item.transcription.completed' && e.transcription) {
        t.userText += e.transcription
      } else if (e.event === 'response.started') {
        t.responseStartedAt ??= e.ts
      } else if (e.event === 'response.text.delta' && e.delta) {
        t.firstTextAt ??= e.ts
        t.replyText += e.delta
      } else if (e.event === 'response.audio.delta') {
        t.firstAudioAt ??= e.ts
        t.lastAudioAt = e.ts
        t.audioBytes += e.audio_bytes ?? 0
      } else if (['response.completed', 'response.interrupted', 'error', 'session.reconnected'].includes(e.event)) {
        t.endedAt ??= e.ts
        t.endKind ??= e.event
      }
    } else if (e.stage === 'puppet') {
      t.puppetAt = e.ts
      t.puppetResult = e.event === 'puppet_error' ? `error: ${e.reason}` : `ok (${e.mode})`
    }
  }
  return turns
}

const ms = (from: number | null, to: number | null) => (from === null || to === null ? '—' : `${to - from} ms`)

/** Solo se pinta en rojo lo que indica pérdida: audio descartado o respuesta que no terminó bien. */
function TurnCard({ turn }: { turn: Turn }) {
  const dropped = Object.entries(turn.droppedChunks)
  const badEnd = turn.endKind !== null && turn.endKind !== 'response.completed'
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>
        Turno {turn.id} — {new Date(turn.userStartAt).toLocaleTimeString()}
        {turn.box ? ` — box: ${turn.box}` : ''}
      </p>
      <p style={{ margin: '8px 0 0' }}>
        <strong>Usuario (transcripción de ms-llm):</strong> {turn.userText || <em style={{ color: '#c00' }}>sin transcripción</em>}
      </p>
      <p style={{ margin: '4px 0 0' }}>
        <strong>Avatar:</strong> {turn.replyText || <em style={{ color: '#888' }}>sin texto de respuesta</em>}
      </p>
      {turn.classifierText && (
        <p style={{ margin: '4px 0 0', color: '#555' }}>
          <strong>Clasificador:</strong> {turn.classifierText}
        </p>
      )}
      <table style={{ marginTop: 8, borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ paddingRight: 16 }}>Habla del usuario (primer → último chunk)</td>
            <td>{ms(turn.userStartAt, turn.userLastAudioAt)}</td>
          </tr>
          <tr>
            <td>Último chunk del usuario → response.started</td>
            <td>{ms(turn.userLastAudioAt, turn.responseStartedAt)}</td>
          </tr>
          <tr>
            <td>Último chunk del usuario → primer texto</td>
            <td>{ms(turn.userLastAudioAt, turn.firstTextAt)}</td>
          </tr>
          <tr>
            <td>Último chunk del usuario → primer audio</td>
            <td>{ms(turn.userLastAudioAt, turn.firstAudioAt)}</td>
          </tr>
          <tr>
            <td>Duración de la respuesta (started → fin)</td>
            <td>{ms(turn.responseStartedAt, turn.endedAt)}</td>
          </tr>
          <tr>
            <td>Fin de la respuesta → puppet</td>
            <td>
              {ms(turn.endedAt, turn.puppetAt)} {turn.puppetResult ? `(${turn.puppetResult})` : ''}
            </td>
          </tr>
          {turn.classifierDoneAt !== null && (
            <tr>
              <td>Último chunk del usuario → veredicto del clasificador</td>
              <td>{ms(turn.userLastAudioAt, turn.classifierDoneAt)}</td>
            </tr>
          )}
        </tbody>
      </table>
      <p style={{ margin: '8px 0 0', color: '#555' }}>
        Chunks: {turn.receivedChunks} recibidos del browser → {turn.sentChunks} enviados a ms-llm
        {turn.bufferedChunks ? `, ${turn.bufferedChunks} en cola mientras conectaba` : ''} — audio de respuesta:{' '}
        {Math.round(turn.audioBytes / 1024)} KB
      </p>
      {dropped.length > 0 && (
        <p style={{ margin: '4px 0 0', color: '#c00' }}>
          Descartados: {dropped.map(([reason, n]) => `${n} (${reason})`).join(', ')}
        </p>
      )}
      {badEnd && <p style={{ margin: '4px 0 0', color: '#c00' }}>La respuesta terminó con {turn.endKind}</p>}
    </div>
  )
}

/** Live per-turn timeline fed by /debug/audio-tap?channel=trace. */
export function TurnTracePanel({
  token,
  connected,
}: {
  token: string
  connected: { clientKey: string; externalId: string }
}) {
  const [events, setEvents] = useState<TraceEvent[]>([])
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed'>('connecting')
  const [showLog, setShowLog] = useState(false)

  useEffect(() => {
    const url = new URL('/debug/audio-tap', config.orchestratorWsUrl)
    url.searchParams.set('token', token)
    url.searchParams.set('client_key', connected.clientKey)
    url.searchParams.set('external_id', connected.externalId)
    url.searchParams.set('channel', 'trace')

    let closedByUs = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let ws: WebSocket | null = null

    const connect = () => {
      setWsStatus('connecting')
      ws = new WebSocket(url.toString())
      ws.onopen = () => setWsStatus('open')
      ws.onmessage = (msg) => {
        let parsed: TraceEvent & { type?: string }
        try {
          parsed = JSON.parse(msg.data as string)
        } catch {
          return
        }
        if (parsed.type !== 'trace') return
        setEvents((prev) => [...prev.slice(-(MAX_EVENTS - 1)), parsed])
      }
      ws.onclose = () => {
        setWsStatus('closed')
        if (!closedByUs) retryTimer = setTimeout(connect, 2000)
      }
      ws.onerror = () => ws?.close()
    }

    connect()
    return () => {
      closedByUs = true
      if (retryTimer) clearTimeout(retryTimer)
      ws?.close()
    }
  }, [token, connected])

  const turns = useMemo(() => buildTurns(events), [events])
  const recent = useMemo(() => [...turns].reverse().slice(0, 20), [turns])

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 16 }}>Traza por turno</h2>
      <p style={{ color: '#666', fontSize: 12 }}>
        WS: <strong>{wsStatus}</strong> — {events.length} evento(s). Los tiempos son del reloj del orquestador; no incluyen la
        red hasta el totem.{' '}
        <button type="button" onClick={() => setEvents([])}>
          Limpiar
        </button>{' '}
        <button type="button" onClick={() => setShowLog((v) => !v)}>
          {showLog ? 'Ocultar log' : 'Ver log de eventos'}
        </button>
      </p>

      {recent.length === 0 && <p style={{ color: '#888' }}>Esperando un turno…</p>}
      {recent.map((turn) => (
        <TurnCard key={turn.id} turn={turn} />
      ))}

      {showLog && (
        <pre style={{ fontSize: 11, maxHeight: 300, overflow: 'auto', background: '#f6f6f6', padding: 8 }}>
          {events
            .filter((e) => e.event !== 'input.audio' && e.event !== 'response.audio.delta')
            .slice(-300)
            .map((e, i, arr) => {
              const prev = i > 0 ? arr[i - 1].ts : e.ts
              const detail = e.delta ?? e.transcription ?? e.text ?? e.dropped ?? e.reason ?? ''
              return `${new Date(e.ts).toLocaleTimeString()}.${String(e.ts % 1000).padStart(3, '0')} +${e.ts - prev}ms  ${e.stage.padEnd(10)} ${e.event} ${detail}`
            })
            .join('\n')}
        </pre>
      )}
    </div>
  )
}
