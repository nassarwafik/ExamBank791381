import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './design-tokens.css'
import './design-tokens-dark.css'
import './fonts.css'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './ErrorBoundary.tsx'
import { initInstallPrompt } from './pwa/installPrompt'
import { registerServiceWorker } from './pwa/registerServiceWorker'
import { installPullToRefreshGuard } from './pwa/pullToRefreshGuard'
import { initThemePreference } from './ui/themePreference'

// Phase 6A — optional installation: capture the browser's install prompt early, register the (non-caching)
// service worker in production builds. Neither affects sign-in or the app when unsupported.
initInstallPrompt()
registerServiceWorker()
// Mobile session safety — the native pull-to-refresh gesture must never reload ExamBank by accident (exam, Reader,
// Messages, Games). Ordinary scrolling and explicit reloads are unaffected (see pullToRefreshGuard.ts).
installPullToRefreshGuard()
// UX-R18a — the device's «المظهر» choice (system / light / dark) on <html data-theme>; inert until dark mode is released (R18c).
initThemePreference()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
