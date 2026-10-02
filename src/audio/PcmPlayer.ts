// Jitter buffer: cuánto adelantar la reproducción respecto al reloj del
// AudioContext. El audio llega por 2 saltos de WebSocket (Gemini -> totem ->
// MonitorHub -> panel) mientras el panel además decodifica video, así que sin
// este colchón cualquier hipo de red se oye como corte ("entrecortado").
const LEAD_SECONDS = 0.15
// Si la cola se adelanta más que esto al reloj real (ráfaga larga), se
// resincroniza tolerando un blip, en vez de acumular latencia sin límite.
const MAX_LEAD_SECONDS = 0.6

// Reproduce PCM16 mono en streaming con un pequeño jitter buffer para que el
// audio suene continuo pese al jitter de red. Un player por canal (micrófono /
// IA). El AudioContext puede compartirse entre players (ver useAudioSink).
export class PcmPlayer {
  private ctx: AudioContext | null = null
  private gain: GainNode | null = null
  private nextStartAt = 0
  private _volume = 1
  private _muted = false
  private _lastChunkAt = 0
  // Proveedor del AudioContext compartido (ver useAudioSink). Es una función,
  // no la instancia, para que se pueda recrear tras un close() (el remount de
  // React cierra el contexto y luego lo vuelve a pedir).
  private readonly _sharedCtxProvider: (() => AudioContext) | null

  constructor(sharedCtxProvider?: () => AudioContext) {
    this._sharedCtxProvider = sharedCtxProvider ?? null
  }

  private ensureContext(): AudioContext {
    if (this.ctx && this.ctx.state !== 'closed') return this.ctx
    this.ctx = this._sharedCtxProvider ? this._sharedCtxProvider() : new AudioContext()
    this.gain = this.ctx.createGain()
    this.gain.gain.value = this._muted ? 0 : this._volume
    this.gain.connect(this.ctx.destination)
    this.nextStartAt = 0
    return this.ctx
  }

  // Debe llamarse desde un gesto del usuario (política de autoplay).
  async resume(): Promise<void> {
    await this.ensureContext().resume()
  }

  get running(): boolean {
    return this.ctx?.state === 'running'
  }

  get active(): boolean {
    return performance.now() - this._lastChunkAt < 400
  }

  setVolume(value: number): void {
    this._volume = value
    if (this.gain && !this._muted) this.gain.gain.value = value
  }

  setMuted(muted: boolean): void {
    this._muted = muted
    if (this.gain) this.gain.gain.value = muted ? 0 : this._volume
  }

  enqueue(pcm: Uint8Array, sampleRate: number): void {
    const ctx = this.ensureContext()
    if (ctx.state === 'suspended') return

    const samples = pcm.byteLength >> 1
    if (samples === 0) return
    const view = new DataView(pcm.buffer, pcm.byteOffset, samples * 2)
    const buffer = ctx.createBuffer(1, samples, sampleRate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < samples; i++) {
      channel[i] = view.getInt16(i * 2, true) / 32768
    }

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(this.gain!)

    const now = ctx.currentTime
    if (this.nextStartAt < now + 0.005 || this.nextStartAt > now + MAX_LEAD_SECONDS) {
      // Primer chunk, tras un underrun, o la cola se fue muy lejos: (re)arma
      // el colchón de jitter.
      this.nextStartAt = now + LEAD_SECONDS
    }
    source.start(this.nextStartAt)
    this.nextStartAt += buffer.duration
    this._lastChunkAt = performance.now()
  }

  close(): void {
    // No cerrar un AudioContext compartido — es responsabilidad de quien lo creó.
    if (!this._sharedCtxProvider && this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close()
    }
    this.ctx = null
    this.gain = null
    this.nextStartAt = 0
  }
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// "audio/pcm;rate=24000" -> 24000
export function sampleRateFromMime(mime: unknown, fallback: number): number {
  if (typeof mime !== 'string') return fallback
  const match = mime.match(/rate=(\d+)/)
  return match ? Number(match[1]) : fallback
}
