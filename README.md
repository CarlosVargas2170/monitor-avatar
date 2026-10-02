# monitor-avatar

Panel de monitoreo en tiempo real del tótem interactivo. Observa de forma
**pasiva** (nunca envía nada) los WebSockets de `face-recognition-totem-backend`
y muestra en una sola pantalla:

- **Cámara** con las cajas y el nombre reconocido dibujados por el backend.
- **Sesiones**: nombre de la persona, si es conocida o visitante, y el estado
  de la sesión — `activa`, `fuera de cámara` (la persona se fue pero la sesión
  sigue viva) o `finalizada`. Si la persona vuelve, la tarjeta regresa a activa.
- **Conversación**: transcripción en vivo de lo que dice el usuario y de lo que
  detecta/responde Gemini Live, con los fragmentos parciales actualizándose.
- **Audio en vivo**: reproducción del micrófono del usuario y de la voz de la IA
  en canales separados, cada uno con volumen y silencio.
- **Latencia Gemini**: sonda HTTPS continua al servidor de Gemini (actual,
  promedio, p95, mín/máx + sparkline), independiente de la conversación.
- **Espera de respuesta**: cronómetro en vivo mientras Gemini piensa y latencia
  (1er token / total) de la última respuesta.

## Requisitos en el backend

En `face-recognition-totem-backend/.env`:

```
MONITOR_ENABLED=true          # abre el MonitorHub en MONITOR_WS_PORT (8767)
```

Para **oír la voz de la IA** en el panel cuando `AVATAR_ENABLED=true`, activar
además `AVATAR_AUDIO_OUTPUT_ENABLED=true`. El texto de la IA (`ai_transcript`)
siempre está disponible aunque el audio no lo esté.

## Configuración del panel

Copiar `.env.example` a `.env` y ajustar si el runtime no corre en localhost:

```
VITE_SESSION_WS_URL=ws://127.0.0.1:8765   # WebSocket de experiencia (WS_PORT)
VITE_MONITOR_WS_URL=ws://127.0.0.1:8767   # MonitorHub (MONITOR_WS_PORT)
```

## Uso

```
npm install
npm run dev
```

Abrir el navegador y pulsar **«Activar audio»** una vez (los navegadores exigen
un gesto del usuario para reproducir sonido).

## Fuentes de datos

| Señal                         | Origen                                  |
| ----------------------------- | --------------------------------------- |
| video anotado, audio de mic   | MonitorHub (`ws://…:8767`)              |
| nombre, estado de sesión      | eventos `experience_*` / `person_left`  |
| transcripciones               | eventos `user_transcript` / `ai_transcript` |
| voz de la IA                  | evento `ai_audio_chunk`                 |

Los eventos de sesión llegan tanto por el WebSocket de experiencia (8765) como
reenviados por el MonitorHub (8767); el panel los deduplica.
