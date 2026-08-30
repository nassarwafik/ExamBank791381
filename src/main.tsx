import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './design-tokens.css'
import './fonts.css'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './ErrorBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
