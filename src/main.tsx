import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './design-tokens.css'
import './fonts.css'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './ErrorBoundary.tsx'
import { initInstallPrompt } from './pwa/installPrompt'
import { registerServiceWorker } from './pwa/registerServiceWorker'

// Phase 6A — optional installation: capture the browser's install prompt early, register the (non-caching)
// service worker in production builds. Neither affects sign-in or the app when unsupported.
initInstallPrompt()
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
