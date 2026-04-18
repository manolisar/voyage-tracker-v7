// Lightweight toast queue. Carried from v6 with the same public API:
//   const { addToast } = useToast();
//   addToast('Saved', 'success');
//   addToast('Network down', 'error', 6000);

import { useCallback, useState } from 'react';
import { ToastContext } from './ToastContext';

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="toast-container" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.type}`}
            onClick={() => removeToast(t.id)}
          >
            {t.type === 'success' && <span aria-hidden="true">✓</span>}
            {t.type === 'error'   && <span aria-hidden="true">✕</span>}
            {t.type === 'warning' && <span aria-hidden="true">⚠</span>}
            {t.type === 'info'    && <span aria-hidden="true">ℹ</span>}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
