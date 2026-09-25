import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './design-tokens.css'
import './fonts.css'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './ErrorBoundary.tsx'
import { initInstallPrompt } from './pwa/installPrompt'
import { registerServiceWorker } from './pwa/registerServiceWorker'
import { installPullToRefreshGuard } from './pwa/pullToRefreshGuard'

// Phase 6A — optional installation: capture the browser's install prompt early, register the (non-caching)
// service worker in production builds. Neither affects sign-in or the app when unsupported.
initInstallPrompt()
registerServiceWorker()
// Mobile session safety — the native pull-to-refresh gesture must never reload ExamBank by accident (exam, Reader,
// Messages, Games). Ordinary scrolling and explicit reloads are unaffected (see pullToRefreshGuard.ts).
installPullToRefreshGuard()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
