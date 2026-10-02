import { useEffect, useRef, useState } from 'react'
import type { SocketStatus } from '../types'

// WebSocket pasivo con reconexión automática. No envía nada al servidor:
// este panel sólo observa. `onMessage` recibe cada mensaje ya parseado.
export function useReconnectingSocket(
  url: string,
  onMessage: (data: unknown) => void,
): SocketStatus {
  const [status, setStatus] = useState<SocketStatus>('connecting')
  const handlerRef = useRef(onMessage)
  useEffect(() => {
    handlerRef.current = onMessage
  })

  useEffect(() => {
    let ws: WebSocket | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let closedByUs = false

    const connect = () => {
      setStatus('connecting')
      ws = new WebSocket(url)

      ws.onopen = () => setStatus('open')

      ws.onmessage = (event) => {
        try {
          handlerRef.current(JSON.parse(event.data as string))
        } catch {
          // se ignoran mensajes no-JSON
        }
      }

      ws.onclose = () => {
        setStatus('closed')
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
  }, [url])

  return status
}
