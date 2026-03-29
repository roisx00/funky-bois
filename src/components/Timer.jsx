import { useState, useEffect } from 'react';

// ms: milliseconds remaining
export default function Timer({ ms, label = '', onZero }) {
  const [remaining, setRemaining] = useState(ms);

  useEffect(() => {
    setRemaining(ms);
  }, [ms]);

  useEffect(() => {
    if (remaining <= 0) {
      onZero?.();
      return;
    }
    const id = setInterval(() => {
      setRemaining((r) => {
        const next = r - 1000;
        if (next <= 0) { clearInterval(id); onZero?.(); return 0; }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [remaining, onZero]);

  const total  = Math.max(0, remaining);
  const h  = Math.floor(total / 3600000);
  const m  = Math.floor((total % 3600000) / 60000);
  const s  = Math.floor((total % 60000) / 1000);

  const pad = (n) => String(n).padStart(2, '0');

  return (
    <div>
      {label && <p style={{ fontWeight: 700, marginBottom: 10, letterSpacing: '1px', textTransform: 'uppercase', fontSize: 12, color: '#777' }}>{label}</p>}
      <div className="timer">
        {h > 0 && (
          <>
            <div className="timer-unit">
              <div className="timer-digits">{pad(h)}</div>
              <div className="timer-label">hrs</div>
            </div>
            <div className="timer-colon">:</div>
          </>
        )}
        <div className="timer-unit">
          <div className="timer-digits">{pad(m)}</div>
          <div className="timer-label">min</div>
        </div>
        <div className="timer-colon">:</div>
        <div className="timer-unit">
          <div className="timer-digits">{pad(s)}</div>
          <div className="timer-label">sec</div>
        </div>
      </div>
    </div>
  );
}
