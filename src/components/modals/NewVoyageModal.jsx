// NewVoyageModal — opens from the top bar "+ New Voyage" button (edit mode).
// Collects: voyage name + start date (+ optional end date). The actual file
// write goes through VoyageStore.createVoyage, which stamps a filename built
// from the date + slugified name and upserts _index.json.
//
// Source of truth for copy + layout: mockup/index.html → renderNewVoyageModal.

import { useEffect, useState } from 'react';
import { useVoyageStore } from '../../hooks/useVoyageStore';
import { X } from '../Icons';

export function NewVoyageModal({ shipClass, onClose }) {
  const { createVoyage } = useVoyageStore();
  const [name, setName]           = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate]     = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const canSubmit = !!name.trim() && !!startDate && !busy && !!shipClass;

  async function handleCreate(e) {
    e?.preventDefault?.();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await createVoyage({ shipClass, name: name.trim(), startDate, endDate });
      onClose();
    } catch (err) {
      console.error('[NewVoyageModal] create failed', err);
      setError(err?.message || 'Failed to create voyage.');
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onClose} role="presentation">
      <div
        className="modal-content w-full max-w-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-voyage-title"
      >
        <div className="modal-head flex items-center justify-between">
          <h2 id="new-voyage-title">New Voyage</h2>
          {!busy && (
            <button
              type="button"
              className="p-1 rounded hover:bg-black/10"
              aria-label="Close"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <form className="p-5 grid grid-cols-2 gap-4" onSubmit={handleCreate}>
          <div className="col-span-2">
            <div className="form-label">Voyage name</div>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Yokohama → Vancouver"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              disabled={busy}
            />
          </div>
          <div>
            <div className="form-label">Start date</div>
            <input
              type="date"
              className="form-input font-mono"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={busy}
            />
          </div>
          <div>
            <div className="form-label">End date <span style={{ color: 'var(--color-faint)' }}>(optional)</span></div>
            <input
              type="date"
              className="form-input font-mono"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={busy}
            />
          </div>

          {error && (
            <div
              className="col-span-2 p-3 rounded-lg text-xs"
              style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-fg)' }}
              role="alert"
            >
              <strong>Failed:</strong> {error}
            </div>
          )}

          <div
            className="col-span-2 flex gap-2 justify-end pt-2 border-t mt-2"
            style={{ borderColor: 'var(--color-border-subtle)' }}
          >
            <button
              type="button"
              className="btn-flat px-4 py-2 rounded-lg text-sm"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary px-4 py-2 rounded-lg text-sm"
              disabled={!canSubmit}
            >
              {busy ? 'Creating…' : 'Create voyage'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
