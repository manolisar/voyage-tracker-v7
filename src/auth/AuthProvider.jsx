// AuthProvider — owns authenticated session state.
//
// Three orthogonal axes:
//   1. shipId       — which ship's data is being viewed (set on landing).
//   2. editMode     — false = view-only, true = editing (PIN-gated).
//   3. adminToken   — null OR a GitHub PAT string in memory (admin role).
//
// Edit mode auto-expires after EDIT_SESSION_MS of inactivity.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EDIT_SESSION_MS, EDITOR_ROLES } from '../domain/constants';
import { startInactivityTimer } from './inactivity';
import { loadAuthConfig } from './authConfig';
import { verifyPin } from './passwords';
import { AuthContext } from './AuthContext';

const SESSION_KEY = 'vt7.session';

function readPersistedSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch { return null; }
}

function writePersistedSession(s) {
  try {
    if (!s) sessionStorage.removeItem(SESSION_KEY);
    else sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch { /* sessionStorage unavailable — ignore */ }
}

export function AuthProvider({ children }) {
  // Hydrate ship from sessionStorage so refresh keeps you in.
  // Edit mode + admin token are NEVER persisted — they live only in memory.
  const persisted = readPersistedSession();

  const [shipId, setShipId] = useState(persisted?.shipId || null);
  const [editor, setEditor] = useState(null); // editor role enum or null
  const [editMode, setEditMode] = useState(false);
  const [adminToken, setAdminToken] = useState(null);

  const stopIdleRef = useRef(null);

  // Persist ship selection (and only that) across reloads.
  useEffect(() => {
    writePersistedSession(shipId ? { shipId } : null);
  }, [shipId]);

  const stopEditIdle = useCallback(() => {
    if (stopIdleRef.current) {
      stopIdleRef.current();
      stopIdleRef.current = null;
    }
  }, []);

  const exitEditMode = useCallback(() => {
    setEditMode(false);
    setEditor(null);
    stopEditIdle();
  }, [stopEditIdle]);

  // (Re)arm the idle timer whenever edit mode flips on.
  useEffect(() => {
    if (!editMode) return;
    stopEditIdle();
    stopIdleRef.current = startInactivityTimer({
      ms: EDIT_SESSION_MS,
      onIdle: () => exitEditMode(),
    });
    return stopEditIdle;
  }, [editMode, stopEditIdle, exitEditMode]);

  const selectShip = useCallback((id) => {
    setShipId(id);
    // Switching ships drops any active edit session — never carry across ships.
    setEditMode(false);
    setEditor(null);
    setAdminToken(null);
  }, []);

  const logout = useCallback(() => {
    setShipId(null);
    setEditMode(false);
    setEditor(null);
    setAdminToken(null);
    stopEditIdle();
    writePersistedSession(null);
  }, [stopEditIdle]);

  // Try to enter edit mode by verifying a PIN against the loaded auth.json.
  // Returns true on success, false on bad PIN, throws on infra error.
  const enterEditMode = useCallback(async ({ pin, role }) => {
    if (!shipId) throw new Error('No ship selected');
    if (!Object.values(EDITOR_ROLES).includes(role)) throw new Error('Invalid role');

    const cfg = await loadAuthConfig();
    const record = cfg.ships?.[shipId];
    if (!record) return false;

    const ok = await verifyPin(pin, record);
    if (!ok) return false;

    setEditor(role);
    setEditMode(true);
    return true;
  }, [shipId]);

  const setAdminPat = useCallback((pat) => setAdminToken(pat || null), []);
  const clearAdminPat = useCallback(() => setAdminToken(null), []);

  const value = useMemo(
    () => ({
      shipId,
      editor,
      editMode,
      adminToken,
      isAdmin: !!adminToken,
      selectShip,
      enterEditMode,
      exitEditMode,
      setAdminPat,
      clearAdminPat,
      logout,
    }),
    [shipId, editor, editMode, adminToken, selectShip, enterEditMode, exitEditMode, setAdminPat, clearAdminPat, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
