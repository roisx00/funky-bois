import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ToastContext = createContext(null);

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  const push = useCallback((msg, opts = {}) => {
    const id = nextId++;
    const toast = {
      id,
      msg,
      level: opts.level || 'info',
      duration: opts.duration ?? 4200,
    };
    setToasts((prev) => [...prev, toast]);
    if (toast.duration > 0) {
      const t = setTimeout(() => dismiss(id), toast.duration);
      timers.current.set(id, t);
    }
    return id;
  }, [dismiss]);

  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  }, []);

  const api = {
    toast: push,
    success: (m, o) => push(m, { ...o, level: 'success' }),
    error:   (m, o) => push(m, { ...o, level: 'error' }),
    info:    (m, o) => push(m, { ...o, level: 'info' }),
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.level}`} onClick={() => dismiss(t.id)}>
            <span className="toast-dot" />
            <span className="toast-msg">{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return { toast: noop, success: noop, error: noop, info: noop, dismiss: noop };
  }
  return ctx;
}

function noop() {}
