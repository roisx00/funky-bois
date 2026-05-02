import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Providers from './Providers.jsx'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { ToastProvider } from './components/Toast.jsx'

// Apply persisted theme synchronously before React mounts so we don't
// get a single-frame flash of the wrong palette on reload.
(() => {
  try {
    const stored = window.localStorage.getItem('the1969-theme');
    const initial = (stored === 'dark' || stored === 'light')
      ? stored
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', initial);
  } catch { /* ignore */ }
})();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <Providers>
        <ToastProvider>
          <App />
        </ToastProvider>
      </Providers>
    </ErrorBoundary>
  </StrictMode>,
)
