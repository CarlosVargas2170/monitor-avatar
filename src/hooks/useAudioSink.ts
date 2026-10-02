import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PcmPlayer, base64ToBytes, sampleRateFromMime } from '../audio/PcmPlayer'
import type { SessionEvent } from '../types'

export interface ChannelControls {
  volume: number
  muted: boolean
  active: boolean
  setVolume: (v: number) => void
  setMuted: (m: boolean) => void
}

export interface MicChannel {
  /** person_id occupying this slot, or null when unlabeled/empty (no beam steering active yet). */
  key: string | null
  label: string
  ch: ChannelControls
}

export interface AudioSink {
  started: boolean
  start: () => Promise<void>
  /**
   * Exactly 2 fixed mic slots — the XVF3800's hard limit of simultaneous
   * fixed beams (face-recognition-totem-backend's app/audio_beam/). Each
   * slot gets assigned to whichever person_id first sends audio into it,
   * so each isolated speaker can be listened to independently to confirm
   * the isolation is actually working. Without beam steering active,
   * everything lands in slot 0 (unlabeled), same as the single-channel
   * behavior before this.
   */
  micChannels: [MicChannel, MicChannel]
  ai: ChannelControls
  pushUserAudio: (pcmB64: string, sampleRate: number, personId: string | null) => void
  pushSessionEvent: (event: SessionEvent) => void
}

function useChannel(player: PcmPlayer): ChannelControls {
  const [volume, setVol] = useState(1)
  const [muted, setMut] = useState(false)
  const [active, setActive] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setActive(player.active), 150)
    return () => clearInterval(id)
  }, [player])

  const setVolume = useCallback(
    (v: number) => {
      setVol(v)
      player.setVolume(v)
    },
    [player],
  )
  const setMuted = useCallback(
    (m: boolean) => {
      setMut(m)
      player.setMuted(m)
    },
    [player],
  )

  return { volume, muted, active, setVolume, setMuted }
}

function labelForKey(key: string | null): string {
  if (key === null) return 'Micrófono'
  return `Micrófono · ${key}`
}

// Reproduce en vivo hasta 2 canales de micrófono (uno por persona aislada
// por el beam del XVF3800, si está activo) y el de la voz de la IA, cada
// uno con su volumen y silencio independiente.
export function useAudioSink(): AudioSink {
  // Un único AudioContext para los 3 players: 3 contextos separados (cada uno
  // resampleando 24k/16k a su tasa nativa) recargan un panel que además
  // renderiza video y provocan underruns. Se crea lazy y se recrea si quedó
  // cerrado (el remount de React cierra el contexto en el cleanup).
  const ctxRef = useRef<AudioContext | null>(null)
  const getCtx = useCallback(() => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext()
    }
    return ctxRef.current
  }, [])
  const aiPlayer = useMemo(() => new PcmPlayer(getCtx), [getCtx])
  const slot0Player = useMemo(() => new PcmPlayer(getCtx), [getCtx])
  const slot1Player = useMemo(() => new PcmPlayer(getCtx), [getCtx])
  // slotKeys[i] = person_id currently assigned to that slot, or null if
  // still unclaimed. A single unlabeled stream (no beam steering) always
  // lands in slot 0 and never claims slot 1.
  const [slotKeys, setSlotKeys] = useState<[string | null, string | null]>([null, null])
  const slotKeysRef = useRef(slotKeys)
  slotKeysRef.current = slotKeys
  const [started, setStarted] = useState(false)
  const startedRef = useRef(false)

  useEffect(() => {
    return () => {
      aiPlayer.close()
      slot0Player.close()
      slot1Player.close()
      if (ctxRef.current && ctxRef.current.state !== 'closed') {
        void ctxRef.current.close()
      }
      ctxRef.current = null
    }
  }, [aiPlayer, slot0Player, slot1Player])

  const start = useCallback(async () => {
    await Promise.all([aiPlayer.resume(), slot0Player.resume(), slot1Player.resume()])
    startedRef.current = true
    setStarted(true)
  }, [aiPlayer, slot0Player, slot1Player])

  const pushUserAudio = useCallback(
    (pcmB64: string, sampleRate: number, personId: string | null) => {
      const [k0, k1] = slotKeysRef.current
      let slotIndex: 0 | 1 | null = null
      if (personId === null) {
        slotIndex = 0 // unlabeled always plays through slot 0
      } else if (personId === k0) {
        slotIndex = 0
      } else if (personId === k1) {
        slotIndex = 1
      } else if (k0 === null) {
        slotIndex = 0
      } else if (k1 === null) {
        slotIndex = 1
      } else {
        return // both slots already claimed by other people — drop a stray 3rd id
      }

      if (slotKeysRef.current[slotIndex] !== personId) {
        const next: [string | null, string | null] = [...slotKeysRef.current] as [string | null, string | null]
        next[slotIndex] = personId
        slotKeysRef.current = next
        setSlotKeys(next)
      }

      if (!startedRef.current) return
      const player = slotIndex === 0 ? slot0Player : slot1Player
      player.enqueue(base64ToBytes(pcmB64), sampleRate || 16000)
    },
    [slot0Player, slot1Player],
  )

  const pushSessionEvent = useCallback(
    (event: SessionEvent) => {
      if (!startedRef.current) return
      if (event.event_type !== 'ai_audio_chunk') return
      const data = event.payload['audio_data']
      if (typeof data !== 'string') return
      const rate = sampleRateFromMime(event.payload['audio_mime_type'], 24000)
      aiPlayer.enqueue(base64ToBytes(data), rate)
    },
    [aiPlayer],
  )

  const ai = useChannel(aiPlayer)
  const slot0Ch = useChannel(slot0Player)
  const slot1Ch = useChannel(slot1Player)

  const micChannels: [MicChannel, MicChannel] = [
    { key: slotKeys[0], label: labelForKey(slotKeys[0]), ch: slot0Ch },
    { key: slotKeys[1], label: labelForKey(slotKeys[1]), ch: slot1Ch },
  ]

  return { started, start, micChannels, ai, pushUserAudio, pushSessionEvent }
}
