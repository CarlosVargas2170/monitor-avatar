import { useEffect, useRef, useState } from 'react'
import { config } from './config'
import { PcmPlayer, base64ToBytes, sampleRateFromMime } from './audio/PcmPlayer'

interface OrchestratorClient {
  id: string
  clientKey: string
  name: string | null
  isSystem: boolean
}

interface OrchestratorDevice {
  externalId: string
  appId: string
  avatarId: string
}

type TapChannel = 'received' | 'sent'

const CHANNEL_LABEL: Record<TapChannel, string> = {
  received: 'Recibido del micrófono (crudo)',
  sent: 'Enviado a ms-llm',
}

const CHANNEL_HINT: Record<TapChannel, string> = {
  received: 'Todo frame que llega del browser, incluso los que el orquestador descarta mientras ignora el micrófono.',
  sent: 'Solo lo que RealtimeGateway.forwardToLlm efectivamente reenvía al proveedor LLM.',
}

/** One /debug/audio-tap?channel=received|sent connection for one external_id. */
function useAudioTapChannel(token: string | null, connected: { clientKey: string; externalId: string } | null, channel: TapChannel) {
  const [wsStatus, setWsStatus] = useState<'idle' | 'connecting' | 'open' | 'closed'>('idle')
  const [muted, setMuted] = useState(false)
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const [chunkCount, setChunkCount] = useState(0)
  const [lastChunkAgoMs, setLastChunkAgoMs] = useState<number | null>(null)
  const lastChunkAtRef = useRef<number | null>(null)
  const playerRef = useRef<PcmPlayer>(new PcmPlayer())

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLastChunkAgoMs(lastChunkAtRef.current === null ? null : Date.now() - lastChunkAtRef.current)
    }, 200)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!token || !connected) return

    const url = new URL('/debug/audio-tap', config.orchestratorWsUrl)
    url.searchParams.set('token', token)
    url.searchParams.set('client_key', connected.clientKey)
    url.searchParams.set('external_id', connected.externalId)
    url.searchParams.set('channel', channel)

    let closedByUs = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let ws: WebSocket | null = null

    const connect = () => {
      setWsStatus('connecting')
      ws = new WebSocket(url.toString())

      ws.onopen = () => setWsStatus('open')

      ws.onmessage = (event) => {
        let msg: { type?: string; audio?: string; mime_type?: string }
        try {
          msg = JSON.parse(event.data as string)
        } catch {
          return
        }
        if (msg.type !== 'input.audio' || typeof msg.audio !== 'string') return

        lastChunkAtRef.current = Date.now()
        setChunkCount((n) => n + 1)
        if (!mutedRef.current) {
          playerRef.current.enqueue(base64ToBytes(msg.audio), sampleRateFromMime(msg.mime_type, 16000))
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, connected, channel])

  useEffect(() => {
    void playerRef.current.resume()
  }, [])

  return { wsStatus, muted, setMuted, chunkCount, lastChunkAgoMs }
}

function ChannelPanel({
  channel,
  token,
  connected,
}: {
  channel: TapChannel
  token: string | null
  connected: { clientKey: string; externalId: string } | null
}) {
  const tap = useAudioTapChannel(token, connected, channel)
  const isStale = tap.lastChunkAgoMs !== null && tap.lastChunkAgoMs > 1000

  return (
    <div style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8, flex: 1, minWidth: 220 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{CHANNEL_LABEL[channel]}</p>
      <p style={{ margin: '4px 0 12px', color: '#666', fontSize: 12 }}>{CHANNEL_HINT[channel]}</p>
      <p style={{ margin: 0 }}>
        WS: <strong>{tap.wsStatus}</strong>
      </p>
      <p style={{ color: isStale ? '#c00' : '#0a0' }}>
        {tap.lastChunkAgoMs === null ? 'Sin chunks recibidos todavía' : `Último chunk hace ${tap.lastChunkAgoMs}ms`}
        {' — '}
        {tap.chunkCount} chunk(s) en total
      </p>
      <button type="button" onClick={() => tap.setMuted((m) => !m)}>
        {tap.muted ? 'Activar sonido' : 'Silenciar'}
      </button>
    </div>
  )
}

/** /debug/orchestrator-audio — compares mic input received vs. audio actually sent to ms-llm. */
export function OrchestratorAudioDebugPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  const [clients, setClients] = useState<OrchestratorClient[]>([])
  const [clientsError, setClientsError] = useState('')
  const [clientKey, setClientKey] = useState('')

  const [devices, setDevices] = useState<OrchestratorDevice[]>([])
  const [devicesError, setDevicesError] = useState('')
  const [externalId, setExternalId] = useState('')

  const [connected, setConnected] = useState<{ clientKey: string; externalId: string } | null>(null)
  const [resetNonce, setResetNonce] = useState(0)

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')
    setLoggingIn(true)
    try {
      const res = await fetch(`${config.orchestratorHttpUrl}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) throw new Error(res.status === 401 ? 'Email o contraseña incorrectos' : `HTTP ${res.status}`)
      const data = await res.json()
      if (!data.access_token) throw new Error('Respuesta sin access_token')
      setToken(data.access_token as string)
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login falló')
    } finally {
      setLoggingIn(false)
    }
  }

  useEffect(() => {
    if (!token) return
    setClientsError('')
    fetch(`${config.orchestratorHttpUrl}/clients`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<OrchestratorClient[]>
      })
      .then((list) => {
        setClients(list)
        setClientKey((current) => current || list[0]?.clientKey || '')
      })
      .catch((err) => setClientsError(err instanceof Error ? err.message : 'No se pudo cargar la lista de clientes'))
  }, [token])

  useEffect(() => {
    if (!token || !clientKey) {
      setDevices([])
      return
    }
    setDevicesError('')
    setExternalId('')
    fetch(`${config.orchestratorHttpUrl}/clients/${clientKey}/devices`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<OrchestratorDevice[]>
      })
      .then((list) => {
        setDevices(list)
        setExternalId(list[0]?.externalId || '')
      })
      .catch((err) => setDevicesError(err instanceof Error ? err.message : 'No se pudo cargar la lista de equipos'))
  }, [token, clientKey])

  const connect = (e: React.FormEvent) => {
    e.preventDefault()
    setResetNonce((n) => n + 1)
    setConnected({ clientKey: clientKey.trim(), externalId: externalId.trim() })
  }

  return (
    <div style={{ maxWidth: 760, margin: '40px auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 18 }}>Debug: audio del micrófono (avatar-orchestrator)</h1>
      <p style={{ color: '#666', fontSize: 13 }}>
        Compará lo que llega del micrófono del totem con lo que efectivamente se reenvía a ms-llm, para un
        external_id — útil para confirmar que la ventana de "ignorar micrófono" mientras el avatar responde está
        cortando los chunks correctos.
      </p>

      {!token && (
        <form onSubmit={login} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
          <input type="email" placeholder="Email admin" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" disabled={loggingIn}>
            {loggingIn ? 'Entrando…' : 'Entrar'}
          </button>
          {loginError && <p style={{ color: '#c00' }}>{loginError}</p>}
        </form>
      )}

      {token && (
        <>
          <form onSubmit={connect} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
            <select value={clientKey} onChange={(e) => setClientKey(e.target.value)} required>
              {clients.length === 0 && <option value="">{clientsError || 'Cargando clientes…'}</option>}
              {clients.map((c) => (
                <option key={c.clientKey} value={c.clientKey}>
                  {c.name || c.clientKey} {c.isSystem ? '(sistema)' : ''}
                </option>
              ))}
            </select>
            <select value={externalId} onChange={(e) => setExternalId(e.target.value)} required disabled={!clientKey}>
              {devices.length === 0 && <option value="">{devicesError || 'Cargando equipos…'}</option>}
              {devices.map((d) => (
                <option key={d.externalId} value={d.externalId}>
                  {d.externalId}
                </option>
              ))}
            </select>
            <button type="submit" disabled={!clientKey || !externalId}>
              Escuchar
            </button>
          </form>

          {connected && (
            <div style={{ marginTop: 24 }}>
              <p>
                clientKey: <strong>{connected.clientKey}</strong> — external_id: <strong>{connected.externalId}</strong>
              </p>
              <div key={resetNonce} style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <ChannelPanel channel="received" token={token} connected={connected} />
                <ChannelPanel channel="sent" token={token} connected={connected} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
