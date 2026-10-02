/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SESSION_WS_URL?: string
  readonly VITE_MONITOR_WS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
