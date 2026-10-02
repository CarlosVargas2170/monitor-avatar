// Endpoints del runtime del tótem que este panel observa de forma pasiva.
// - sessionWsUrl: WebSocket de experiencia (avatar-frontend también lo usa).
//   Emite eventos crudos { event_type, session_id, payload, timestamp }.
// - monitorWsUrl: MonitorHub (MONITOR_ENABLED=true en face-recognition-totem-backend).
//   Emite video_frame, user_audio y session_event (envoltorio de lo anterior).
export const config = {
  sessionWsUrl: import.meta.env.VITE_SESSION_WS_URL || 'ws://127.0.0.1:8765',
  monitorWsUrl: import.meta.env.VITE_MONITOR_WS_URL || 'ws://127.0.0.1:8767',
  // avatar-orchestrator's own WS (RealtimeGateway) — /debug/audio-tap mirrors
  // the exact input.audio frames it forwards to the llm provider. Separate
  // service, separate origin from the totem's sessionWsUrl/monitorWsUrl above.
  orchestratorWsUrl: (import.meta.env.VITE_ORCHESTRATOR_WS_URL || 'ws://localhost:3100').replace(/\/+$/, ''),
  // POST {orchestratorHttpUrl}/auth for the admin token /debug/audio-tap requires.
  orchestratorHttpUrl: (import.meta.env.VITE_ORCHESTRATOR_HTTP_URL || 'http://localhost:3100').replace(/\/+$/, ''),
}
