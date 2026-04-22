import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) {
    console.error('[ErrorBoundary]', err, info?.componentStack);
  }
  render() {
    if (this.state.err) {
      const msg = this.state.err?.message || String(this.state.err);
      return (
        <div className="page" style={{ textAlign: 'center', paddingTop: 120, maxWidth: 640 }}>
          <h1 className="page-title" style={{ borderBottom: 'none', marginBottom: 20 }}>
            Something crashed.
          </h1>
          <p style={{ color: 'var(--text-3)', marginBottom: 24, fontSize: 15 }}>
            The page hit an error. Reload to try again. If it keeps happening, the details below
            help us debug.
          </p>
          <pre style={{
            textAlign: 'left',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            background: 'var(--paper-2)',
            border: '1px solid var(--hairline)',
            padding: 16,
            borderRadius: 4,
            overflow: 'auto',
            maxHeight: 300,
          }}>{msg}</pre>
          <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn btn-solid" onClick={() => window.location.reload()}>Reload</button>
            <button className="btn btn-ghost" onClick={() => { window.location.href = '/'; }}>Home</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
