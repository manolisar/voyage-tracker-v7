// EditModeModal — invoked from the TopBar "Enable Edit Mode" button when
// the user is in View Only and wants to start editing the currently-loaded ship.

import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { EDITOR_ROLES, EDITOR_ROLE_LABELS } from '../../domain/constants';
import { PinInput } from './PinInput';
import { X } from '../Icons';

export function EditModeModal({ shipDisplayName, onClose }) {
  const { enterEditMode } = useAuth();
  const [pin, setPin] = useState('');
  const [role, setRole] = useState(EDITOR_ROLES.CHIEF);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Esc to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSubmit() {
    if (pin.length !== 4) return;
    setSubmitting(true);
    setError(null);
    try {
      const ok = await enterEditMode({ pin, role });
      if (ok) onClose();
      else setError(`Incorrect PIN for ${shipDisplayName}.`);
    } catch (e) {
      setError(e.message || 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-content w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-modal-title"
      >
        <div className="modal-head flex items-start justify-between">
          <div>
            <h2 id="edit-modal-title">Enable Edit Mode</h2>
            <p>Editing {shipDisplayName} · 30-min idle timeout</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-black/5"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <label className="form-label" htmlFor="edit-role">Editor role</label>
          <select
            id="edit-role"
            className="form-input mb-5"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={submitting}
          >
            {Object.entries(EDITOR_ROLE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>

          <label className="form-label">PIN</label>
          <PinInput
            value={pin}
            onChange={(v) => { setPin(v); setError(null); }}
            onSubmit={handleSubmit}
            autoFocus
            hasError={!!error}
          />

          {error && (
            <div
              role="alert"
              className="mt-4 p-3 rounded-lg text-sm"
              style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-fg)' }}
            >
              {error}
            </div>
          )}

          <div className="mt-6 flex gap-3 justify-end">
            <button type="button" className="btn-flat px-4 py-2 rounded-lg text-sm" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-warning px-4 py-2 rounded-lg text-sm"
              disabled={pin.length !== 4 || submitting}
              onClick={handleSubmit}
            >
              {submitting ? 'Verifying…' : 'Enable Edit Mode'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
