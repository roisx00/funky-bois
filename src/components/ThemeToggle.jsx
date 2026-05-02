// Dark / light theme toggle. Flips the data-theme attribute on the
// root <html> element. The CSS variables defined in index.css under
// [data-theme="dark"] take over. Preference persisted in localStorage.
//
// Default: respects prefers-color-scheme on first visit.
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'the1969-theme';

function readInitialTheme() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch { /* private mode etc */ }
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState(readInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { window.localStorage.setItem(STORAGE_KEY, theme); } catch {}
  }, [theme]);

  return { theme, setTheme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) };
}

export default function ThemeToggle({ floating = false }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  const baseStyle = {
    width: 36, height: 36,
    border: '1px solid var(--ink)',
    background: 'var(--surface-2)',
    color: 'var(--ink)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    fontSize: 16,
    transition: 'background 120ms, color 120ms',
  };
  const floatingStyle = floating ? {
    position: 'fixed',
    bottom: 24,
    right: 24,
    zIndex: 50,
    width: 44, height: 44,
    boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
  } : {};

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{ ...baseStyle, ...floatingStyle }}
    >
      {isDark ? (
        // Sun icon for "switch to light"
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" /><path d="M12 20v2" />
          <path d="M4.93 4.93l1.41 1.41" /><path d="M17.66 17.66l1.41 1.41" />
          <path d="M2 12h2" /><path d="M20 12h2" />
          <path d="M4.93 19.07l1.41-1.41" /><path d="M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        // Moon icon for "switch to dark"
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
