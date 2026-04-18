// RotatePinModal — admin sub-modal launched from the AdminPanel ships table.
//
// Flow:
//   1. Admin enters NEW PIN twice (4 digits, must match).
//   2. We hash the new PIN, write the updated record into the in-memory
//      auth.json, then push to GitHub via persistAuthConfig().
//   3. The next time anyone tries to enter Edit Mode for this ship, the new
//      PIN is required (loadAuthConfig cache is updated by persistAuthConfig).

import { useEffect, useState } from 'react';
import { hashPin } from '../../auth/passwords';
import { loadAuthConfig, persistAuthConfig } from '../../auth/authConfig';
import { PinInput } from '../auth/PinInput';
import { X } from '../Icons';

export function RotatePinModal({ shipId, shipDisplayName, onClose, onSuccess }) {
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !submitting) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const ready = pin1.length === 4 && pin2.length === 4;

  async function handleSubmit() {
    if (!ready) return;
    if (pin1 !== pin2) { setError('PINs do not match.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const record = await hashPin(pin1);
      const cfg = await loadAuthConfig();
      const next = {
        ...cfg,
        ships: { ...(cfg.ships || {}), [shipId]: record },
      };
      await persistAuthConfig(next, 'rotate-pin');
      onSuccess?.();
      onClose();
    } catch (e) {
      setError(e.message || 'Failed to rotate PIN');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={submitting ? undefined : onClose} role="presentation">
      <div
        className="modal-content w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rotate-pin-title"
      >
        <div className="modal-head flex items-start justify-between">
          <div>
            <h2 id="rotate-pin-title">Rotate PIN</h2>
            <p>{shipDisplayName} · 4 digits</p>
          </div>
          {!submitting && (
            <button type="button" onClick={onClose} className="p-1 rounded hover:bg-black/5" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="form-label">New PIN</label>
            <PinInput
              value={pin1}
              onChange={(v) => { setPin1(v); setError(null); }}
              onSubmit={() => { /* require both fields */ }}
              autoFocus
              hasError={!!error}
              disabled={submitting}
              ariaLabel="New PIN"
            />
          </div>
          <div>
            <label className="form-label">Confirm PIN</label>
            <PinInput
              value={pin2}
              onChange={(v) => { setPin2(v); setError(null); }}
              onSubmit={handleSubmit}
              autoFocus={false}
              hasError={!!error}
              disabled={submitting}
              ariaLabel="Confirm new PIN"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 rounded-lg text-sm"
              style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-fg)' }}
            >
              {error}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button type="button" className="btn-flat px-4 py-2 rounded-lg text-sm" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-warning px-4 py-2 rounded-lg text-sm"
              onClick={handleSubmit}
              disabled={!ready || submitting}
            >
              {submitting ? 'Rotating…' : 'Rotate PIN'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
