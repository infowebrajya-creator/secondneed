import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App.tsx'
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx'

// Guarantee offline local database persistence against browser auto-eviction
if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then((isPersisted) => {
    if (isPersisted) {
      console.log('[Storage] Persistent storage granted by browser.');
    }
  }).catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
