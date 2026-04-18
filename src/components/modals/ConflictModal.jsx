// ConflictModal — shown when GitHub returns 409 on save (someone else edited
// the same voyage between our load and our save).
//
// Three options (CLAUDE.md §3):
//   • Reload remote   — discard local edits, refetch the file
//   • Force overwrite — re-save without a SHA, clobbering the remote version
//   • Cancel          — keep editing locally, defer the choice
//
// The actual reload / force / cancel logic lives in VoyageStoreProvider —
// this component is purely the dialog.

import { useEffect } from 'react';
import { X, Cloud } from '../Icons';

export function ConflictModal({
  filename,
  voyageLabel,
  onReload,
  onForce,
  onCancel,
  busy = false,
}) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onCancel} role="presentation">
      <div
        className="modal-content w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-title"
      >
        <div
          className="modal-head flex items-start justify-between"
          style={{ background: 'var(--color-warn-bg)', color: 'var(--color-warn-fg)' }}
        >
          <div className="flex items-start gap-3">
            <Cloud className="w-6 h-6 mt-0.5 shrink-0" />
            <div>
              <h2 id="conflict-title" style={{ color: 'inherit' }}>Save conflict</h2>
              <p style={{ color: 'inherit', opacity: 0.85 }}>
                Another editor changed <strong>{voyageLabel || filename}</strong> on the server while you were editing.
              </p>
            </div>
          </div>
          {!busy && (
            <button
              type="button"
              onClick={onCancel}
              className="p-1 rounded hover:bg-black/10"
              aria-label="Close"
              style={{ color: 'inherit' }}
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-6 space-y-3">
          <p className="text-sm" style={{ color: 'var(--color-dim)' }}>
            Pick how to resolve this:
          </p>
          <ul className="text-sm space-y-2 list-disc pl-5" style={{ color: 'var(--color-text)' }}>
            <li><strong>Reload remote</strong> — discard your local edits and load the latest version from GitHub.</li>
            <li><strong>Force overwrite</strong> — push your local version, replacing the remote (the other edit will be in git history but not in the current file).</li>
            <li><strong>Cancel</strong> — keep your local edits, do nothing for now. You can copy values out, then resolve manually.</li>
          </ul>

          <div className="mt-6 flex flex-wrap gap-3 justify-end">
            <button
              type="button"
              className="btn-flat px-4 py-2 rounded-lg text-sm"
              onClick={onCancel}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary px-4 py-2 rounded-lg text-sm"
              onClick={onReload}
              disabled={busy}
            >
              {busy ? 'Working…' : 'Reload remote'}
            </button>
            <button
              type="button"
              className="btn-warning px-4 py-2 rounded-lg text-sm"
              onClick={onForce}
              disabled={busy}
            >
              {busy ? 'Working…' : 'Force overwrite'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
