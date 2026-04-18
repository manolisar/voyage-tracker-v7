// PatEntryModal — paste a GitHub fine-grained PAT to unlock the data repo.
//
// CLAUDE.md §4 (Admin access — Option A): the PAT IS the admin credential.
// We never persist it by default; we hold it in JS memory via AuthProvider's
// `setAdminPat`. If the user opts in, we keep it in sessionStorage (tab life
// only) so a refresh doesn't kick them out mid-edit.
//
// We verify the token with GET /user before accepting it, so a fat-fingered
// paste fails immediately instead of mysteriously breaking the next save.

import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { verifyToken } from '../../storage/github';
import { writeRememberedPat } from '../../auth/patStorage';
import { X } from '../Icons';

export function PatEntryModal({ onClose, onUnlocked }) {
  const { setAdminPat } = useAuth();
  const [pat, setPat] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSubmit() {
    const trimmed = pat.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      const { login } = await verifyToken({ getToken: () => trimmed });
      setAdminPat(trimmed);
      writeRememberedPat(remember ? trimmed : null);
      onUnlocked?.({ login });
      onClose();
    } catch (e) {
      setError(e.message || 'Token rejected by GitHub');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-content w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pat-modal-title"
      >
        <div className="modal-head flex items-start justify-between">
          <div>
            <h2 id="pat-modal-title">Connect to data repo</h2>
            <p>Paste a GitHub fine-grained PAT with <code>Contents: Read &amp; Write</code> on the data repo.</p>
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
          <label className="form-label" htmlFor="pat-input">Personal Access Token</label>
          <input
            id="pat-input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="form-input mb-3 font-mono text-sm"
            placeholder="github_pat_…"
            value={pat}
            onChange={(e) => { setPat(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            disabled={submitting}
            autoFocus
          />

          <label className="flex items-center gap-2 text-sm mt-2 mb-1" style={{ color: 'var(--color-dim)' }}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              disabled={submitting}
            />
            Remember for this browser tab (sessionStorage)
          </label>
          <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
            Token is held in JS memory only. Closing the tab discards it.
          </p>

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
              className="btn-primary px-4 py-2 rounded-lg text-sm"
              disabled={!pat.trim() || submitting}
              onClick={handleSubmit}
            >
              {submitting ? 'Verifying…' : 'Verify & Unlock'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
