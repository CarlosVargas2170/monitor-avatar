import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { OrchestratorAudioDebugPage } from './OrchestratorAudioDebugPage.tsx'

// No router dependency for one extra URL — plain path check.
const isOrchestratorAudioDebug = window.location.pathname.startsWith('/debug/orchestrator-audio')

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isOrchestratorAudioDebug ? <OrchestratorAudioDebugPage /> : <App />}</StrictMode>,
)
