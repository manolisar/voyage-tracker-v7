// LandingScreen — first thing the user sees.
// Mirrors mockup behavior:
//   - Pick a ship (dropdown)
//   - Optional PIN + role (filled = enter Edit Mode immediately;
//                         empty = enter View Only)
//   - Open button submits

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { loadShips } from '../../domain/shipClass';
import { EDITOR_ROLES, EDITOR_ROLE_LABELS } from '../../domain/constants';
import { PinInput } from './PinInput';
import { Anchor } from '../Icons';

export function LandingScreen() {
  const { selectShip, enterEditMode } = useAuth();

  const [ships, setShips] = useState([]);
  const [shipId, setShipId] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState(EDITOR_ROLES.CHIEF);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    loadShips()
      .then((data) => {
        if (!alive) return;
        const list = (data.ships || []).filter((s) => s.active);
        setShips(list);
        if (list.length && !shipId) setShipId(list[0].id);
      })
      .catch((e) => alive && setError(`Failed to load ships: ${e.message}`));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedShip = useMemo(
    () => ships.find((s) => s.id === shipId) || null,
    [ships, shipId],
  );

  const pinFilled = pin.length === 4;

  async function handleOpen() {
    if (!shipId) return;
    setError(null);
    setSubmitting(true);

    try {
      if (pinFilled) {
        // Pass shipId explicitly — enterEditMode verifies the PIN first and
        // only commits the ship + edit session together on success. A bad PIN
        // leaves us on the landing screen with the error visible.
        const ok = await enterEditMode({ pin, role, shipId });
        if (!ok) {
          setError(`Incorrect PIN for ${selectedShip?.displayName || 'this ship'}.`);
        }
      } else {
        selectShip(shipId);
      }
    } catch (e) {
      setError(e.message || 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="landing-bg flex-1 min-h-0 flex items-center justify-center p-6 overflow-auto">
      <div
        className="glass-card w-full max-w-md rounded-2xl p-8"
        role="form"
        aria-labelledby="landing-title"
      >
        <header className="flex items-center gap-3 mb-6">
          <span
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
            style={{ background: 'var(--color-ocean-500)' }}
            aria-hidden="true"
          >
            <Anchor className="w-5 h-5" />
          </span>
          <div>
            <h1 id="landing-title" className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
              Voyage Tracker
            </h1>
            <p className="text-xs" style={{ color: 'var(--color-dim)' }}>
              Celebrity Solstice-class · Engine Department
            </p>
          </div>
        </header>

        {/* Ship */}
        <label className="form-label" htmlFor="ship-picker">Ship</label>
        <select
          id="ship-picker"
          className="form-input mb-4"
          value={shipId}
          onChange={(e) => { setShipId(e.target.value); setError(null); }}
          disabled={submitting || ships.length === 0}
        >
          {ships.length === 0 && <option>Loading…</option>}
          {ships.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName} ({s.code}) · {s.yearBuilt}
            </option>
          ))}
        </select>

        {/* Role */}
        <label className="form-label" htmlFor="role-picker">Role</label>
        <select
          id="role-picker"
          className="form-input mb-4"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          disabled={submitting}
        >
          {Object.entries(EDITOR_ROLE_LABELS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>

        {/* PIN (optional) */}
        <div className="mb-2 flex items-center justify-between">
          <label className="form-label" htmlFor="pin-input">Edit-mode PIN <span className="opacity-60">(optional)</span></label>
          <span className="text-[0.65rem]" style={{ color: 'var(--color-faint)' }}>
            Leave empty for View Only
          </span>
        </div>
        <PinInput
          value={pin}
          onChange={(v) => { setPin(v); setError(null); }}
          onSubmit={handleOpen}
          autoFocus={false}
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

        <button
          type="button"
          onClick={handleOpen}
          disabled={!shipId || submitting}
          className="btn-primary w-full mt-6 py-3 rounded-xl text-sm"
        >
          {submitting ? 'Opening…' : pinFilled ? `Open in Edit Mode` : `Open in View Only`}
        </button>

        <p className="mt-6 text-center text-[0.7rem]" style={{ color: 'var(--color-faint)' }}>
          Data lives in a private GitHub repository.<br/>
          Your PC's lock screen is the access boundary.
        </p>
      </div>
    </div>
  );
}
