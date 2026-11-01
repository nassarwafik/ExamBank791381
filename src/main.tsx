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
import { installClientErrorReporting } from './observability/clientErrorReporter'
import { isOwnerLocation } from './owner/ownerRoute'
import OwnerEntry from './owner/OwnerEntry'
import { isInviteLocation } from './invite/inviteRoute'
import InviteEntry from './invite/InviteEntry'

// Tadris+ P1-A2 — the platform owner's area (#/owner) is its own surface and its own LAZY chunk: the teacher / student app is not
// mounted there, and teachers / students never download the owner screens (bundle guard). Crossing the boundary reloads, so the
// two surfaces never share state in one page.
// Tadris+ P2-A2b — the teacher invitation / reset page (#/invite/<token>) is a third surface with its own lazy chunk.
const surfaceOf = () => (isOwnerLocation() ? 'owner' : isInviteLocation() ? 'invite' : 'app')
const surface = surfaceOf()
window.addEventListener('hashchange', () => { if (surfaceOf() !== surface) window.location.reload() })

// Phase 6A — optional installation: capture the browser's install prompt early, register the (non-caching)
// service worker in production builds. Neither affects sign-in or the app when unsupported.
initInstallPrompt()
registerServiceWorker()
// Mobile session safety — the native pull-to-refresh gesture must never reload ExamBank by accident (exam, Reader,
// Messages, Games). Ordinary scrolling and explicit reloads are unaffected (see pullToRefreshGuard.ts).
installPullToRefreshGuard()
// UX-R18a — the device's «المظهر» choice (system / light / dark) on <html data-theme>; inert until dark mode is released (R18c).
initThemePreference()
// D3 — uncaught errors, unhandled rejections and CSP violations of a signed-in session are reported (content-free) to the API logs.
installClientErrorReporting()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {surface === 'owner' ? <OwnerEntry /> : surface === 'invite' ? <InviteEntry /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
)
