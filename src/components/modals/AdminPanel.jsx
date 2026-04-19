// AdminPanel — admin-only modal launched from the TopBar gear when a PAT is
// loaded. Three sections:
//
//   1. Ships table   — list every ship from ships.json with PIN status +
//                      "Rotate PIN" + "Bootstrap _index" actions.
//   2. Token         — show the GitHub login + repo, "Replace token" + "Sign
//                      out of admin" actions.
//   3. Recent commits — pull last 30 commits from the data repo, render as
//                       audit-log rows (parsed trailer when present).
//
// Anything destructive lives behind its own confirmation in a sub-modal.

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { getStorageAdapter } from '../../storage/adapter';
import { loadAuthConfig, loadSeedAuthConfig, persistAuthConfig } from '../../auth/authConfig';
import { writeRememberedPat } from '../../auth/patStorage';
import { verifyToken } from '../../storage/github';
import { loadShips } from '../../domain/shipClass';
import { RotatePinModal } from './RotatePinModal';
import { PatEntryModal } from './PatEntryModal';
import { Cloud, Github, LogOut, Refresh, Settings, X } from '../Icons';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function getAdmin() {
  try {
    const adapter = getStorageAdapter();
    if (adapter?.backend === 'github' && adapter.admin) return adapter.admin;
  } catch { /* not initialized */ }
  return null;
}

export function AdminPanel({ onClose }) {
  const { adminToken, clearAdminPat } = useAuth();
  const admin = getAdmin();

  const [ships, setShips] = useState([]);          // [{id, displayName, ...}]
  const [pinShips, setPinShips] = useState({});    // shipId -> bool (has PIN record)
  const [commits, setCommits] = useState([]);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [tokenLogin, setTokenLogin] = useState(null);
  const [tokenError, setTokenError] = useState(null);
  const [rotateFor, setRotateFor] = useState(null); // {id, displayName}
  const [patModalOpen, setPatModalOpen] = useState(false);
  const [busyShipId, setBusyShipId] = useState(null);
  const [toast, setToast] = useState(null);

  // Esc to close.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Initial load: ships roster + auth.json + token verification + commits.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [{ ships: roster }, cfg] = await Promise.all([
          loadShips(),
          loadAuthConfig({ force: true }),
        ]);
        if (!alive) return;
        setShips(roster);
        const pinMap = {};
        for (const s of roster) pinMap[s.id] = !!cfg.ships?.[s.id];
        setPinShips(pinMap);
      } catch (e) {
        if (alive) setToast({ kind: 'error', text: e.message || 'Failed to load admin data' });
      }
    })();

    if (admin && adminToken) {
      verifyToken({ getToken: () => adminToken })
        .then(({ login }) => alive && setTokenLogin(login))
        .catch((e) => alive && setTokenError(e.message || 'Token check failed'));
    }
    return () => { alive = false; };
  }, [admin, adminToken]);

  const refreshCommits = useCallback(async () => {
    if (!admin) return;
    setLoadingCommits(true);
    try {
      const list = await admin.listRecentCommits({ limit: 30 });
      setCommits(list);
    } catch (e) {
      setToast({ kind: 'error', text: `Commits: ${e.message || e}` });
    } finally {
      setLoadingCommits(false);
    }
  }, [admin]);

  // refreshCommits sets state inside an async fetch — that's the legitimate
  // "fetch on mount" pattern, not a cascading-render footgun. Disable narrowly.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refreshCommits(); }, [refreshCommits]);

  const handleBootstrapIndex = async (shipId) => {
    if (!admin) return;
    setBusyShipId(shipId);
    setToast(null);
    try {
      await admin.bootstrapShipIndex(shipId);
      setToast({ kind: 'ok', text: `Created data/${shipId}/_index.json` });
      refreshCommits();
    } catch (e) {
      setToast({ kind: 'error', text: e.message || String(e) });
    } finally {
      setBusyShipId(null);
    }
  };

  const handleSeedPin = async (shipId) => {
    // Write the canonical seed PIN record into the PERSISTED auth.json.
    // We must pull the seed record directly (loadSeedAuthConfig) instead of
    // forcing a reload of loadAuthConfig() — that reload still prefers the
    // GitHub copy, which by definition doesn't have this ship (that's why
    // we're bootstrapping it). Bypassing GitHub guarantees we can always
    // produce the canonical seed record for the ship.
    if (!admin) return;
    setBusyShipId(shipId);
    setToast(null);
    try {
      const cfg = await loadAuthConfig();
      const seedCfg = await loadSeedAuthConfig();
      const seedRecord = seedCfg.ships?.[shipId];
      if (!seedRecord) throw new Error(`No seed PIN defined for ${shipId}`);
      const next = { ...cfg, ships: { ...(cfg.ships || {}), [shipId]: seedRecord } };
      await persistAuthConfig(next, 'bootstrap');
      setPinShips((p) => ({ ...p, [shipId]: true }));
      setToast({ kind: 'ok', text: `Seed PIN written for ${shipId}` });
      refreshCommits();
    } catch (e) {
      setToast({ kind: 'error', text: e.message || String(e) });
    } finally {
      setBusyShipId(null);
    }
  };

  const handleSignOutAdmin = () => {
    clearAdminPat();
    writeRememberedPat(null);
    onClose();
  };

  const handlePatReplaced = () => {
    // Re-verify display.
    setTokenLogin(null);
    setTokenError(null);
    if (admin && adminToken) {
      verifyToken({ getToken: () => adminToken })
        .then(({ login }) => setTokenLogin(login))
        .catch((e) => setTokenError(e.message));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-content w-full max-w-4xl"
        style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-title"
      >
        <div className="modal-head flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5" />
            <div>
              <h2 id="admin-title">Admin Panel</h2>
              <p>Connected to public data repo · 3 sections</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-black/5" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto" style={{ flex: 1 }}>
          {!admin && (
            <div className="p-6">
              <div
                role="alert"
                className="p-4 rounded-lg text-sm"
                style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-fg)' }}
              >
                Admin Panel requires the GitHub adapter. Set <code>VITE_DATA_REPO</code> and connect a PAT first.
              </div>
            </div>
          )}

          {admin && (
            <>
              {/* ── Token section ─────────────────────────────────────── */}
              <section className="px-6 pt-6">
                <SectionHead icon={<Github className="w-4 h-4" />} title="GitHub access" />
                <div
                  className="rounded-lg border p-4 flex items-start justify-between gap-4 flex-wrap"
                  style={{ borderColor: 'var(--color-border-subtle)', background: 'var(--color-surface2)' }}
                >
                  <div className="text-sm">
                    <div style={{ color: 'var(--color-text)' }}>
                      <strong>{tokenLogin || (tokenError ? 'Token rejected' : 'Verifying…')}</strong>
                    </div>
                    <div style={{ color: 'var(--color-dim)' }} className="font-mono text-xs mt-1">
                      {admin.repo.owner}/{admin.repo.repo} · branch {admin.repo.branch}
                    </div>
                    {tokenError && (
                      <div className="text-xs mt-1" style={{ color: 'var(--color-error-fg)' }}>{tokenError}</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-flat px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
                      onClick={() => setPatModalOpen(true)}
                    >
                      <Cloud className="w-3.5 h-3.5" /> Replace token
                    </button>
                    <button
                      type="button"
                      className="btn-flat px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
                      onClick={handleSignOutAdmin}
                    >
                      <LogOut className="w-3.5 h-3.5" /> Sign out admin
                    </button>
                  </div>
                </div>
              </section>

              {/* ── Ships table ───────────────────────────────────────── */}
              <section className="px-6 pt-6">
                <SectionHead icon={<Settings className="w-4 h-4" />} title="Ships" />
                <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border-subtle)' }}>
                  <table className="w-full text-sm">
                    <thead style={{ background: 'var(--color-surface2)' }}>
                      <tr>
                        <Th>Ship</Th>
                        <Th>Code</Th>
                        <Th>PIN status</Th>
                        <Th align="right">Actions</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {ships.map((s) => {
                        const hasPin = !!pinShips[s.id];
                        const busy = busyShipId === s.id;
                        return (
                          <tr key={s.id} style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                            <Td>{s.displayName}</Td>
                            {/* Canonical 2-letter code lives in ships.json (CLAUDE.md §1: */}
                            {/* SL/EQ/EC/SI/RF). The id-slice fallback only fires for a hand- */}
                            {/* added ship without a `code` field — visible bug, not silent wrong. */}
                            <Td mono>{s.code || (s.id || '').slice(0, 2).toUpperCase()}</Td>
                            <Td>
                              {hasPin
                                ? <span style={{ color: 'var(--color-text)' }}>● configured</span>
                                : <span style={{ color: 'var(--color-faint)' }}>○ not in auth.json</span>}
                            </Td>
                            <Td align="right">
                              <div className="flex gap-2 justify-end">
                                {!hasPin && (
                                  <button
                                    type="button"
                                    className="btn-flat px-2 py-1 rounded text-xs"
                                    disabled={busy}
                                    onClick={() => handleSeedPin(s.id)}
                                    title="Write the canonical seed PIN to auth.json"
                                  >
                                    {busy ? '…' : 'Seed PIN'}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="btn-flat px-2 py-1 rounded text-xs"
                                  disabled={busy}
                                  onClick={() => setRotateFor({ id: s.id, displayName: s.displayName })}
                                >
                                  Rotate PIN
                                </button>
                                <button
                                  type="button"
                                  className="btn-flat px-2 py-1 rounded text-xs"
                                  disabled={busy}
                                  onClick={() => handleBootstrapIndex(s.id)}
                                  title="Create empty _index.json for this ship"
                                >
                                  {busy ? '…' : 'Init data dir'}
                                </button>
                              </div>
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* ── Recent commits ────────────────────────────────────── */}
              <section className="px-6 py-6">
                <div className="flex items-center justify-between mb-2">
                  <SectionHead icon={<Refresh className="w-4 h-4" />} title="Recent commits (audit log)" inline />
                  <button
                    type="button"
                    className="btn-flat px-2 py-1 rounded text-xs flex items-center gap-1.5"
                    onClick={refreshCommits}
                    disabled={loadingCommits}
                  >
                    <Refresh className="w-3.5 h-3.5" />
                    {loadingCommits ? 'Loading…' : 'Refresh'}
                  </button>
                </div>
                <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border-subtle)' }}>
                  {commits.length === 0 ? (
                    <div className="p-4 text-sm" style={{ color: 'var(--color-faint)' }}>
                      {loadingCommits ? 'Loading commits…' : 'No commits found.'}
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead style={{ background: 'var(--color-surface2)' }}>
                        <tr>
                          <Th>When</Th>
                          <Th>Ship</Th>
                          <Th>Action</Th>
                          <Th>File / Voyage</Th>
                          <Th>Editor</Th>
                          <Th>Author</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {commits.map((c) => (
                          <tr key={c.sha} style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                            <Td mono>{formatDate(c.date)}</Td>
                            <Td mono>{c.parsed?.shipId || '—'}</Td>
                            <Td>{c.parsed?.action || '—'}</Td>
                            <Td>
                              <div>{c.parsed?.filename || c.subject}</div>
                              {c.parsed?.voyage && (
                                <div className="text-xs" style={{ color: 'var(--color-dim)' }}>{c.parsed.voyage}</div>
                              )}
                            </Td>
                            <Td>{c.parsed?.editorRole || '—'}</Td>
                            <Td>
                              <span className="font-mono text-xs">{c.author}</span>
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
            </>
          )}
        </div>

        {toast && (
          <div
            className="px-6 py-3 text-sm border-t"
            style={{
              background: toast.kind === 'error' ? 'var(--color-error-bg)' : 'var(--color-warn-bg)',
              color:      toast.kind === 'error' ? 'var(--color-error-fg)' : 'var(--color-warn-fg)',
              borderColor: 'var(--color-border-subtle)',
            }}
            role="status"
          >
            {toast.text}
          </div>
        )}
      </div>

      {rotateFor && (
        <RotatePinModal
          shipId={rotateFor.id}
          shipDisplayName={rotateFor.displayName}
          onClose={() => setRotateFor(null)}
          onSuccess={() => {
            setPinShips((p) => ({ ...p, [rotateFor.id]: true }));
            setToast({ kind: 'ok', text: `PIN rotated for ${rotateFor.displayName}` });
            refreshCommits();
          }}
        />
      )}

      {patModalOpen && (
        <PatEntryModal
          onClose={() => setPatModalOpen(false)}
          onUnlocked={handlePatReplaced}
        />
      )}
    </div>
  );
}

// ── Tiny presentation helpers (kept inline to avoid a file proliferation) ──
function SectionHead({ icon, title, inline = false }) {
  return (
    <div className={`flex items-center gap-2 ${inline ? '' : 'mb-2'}`}
         style={{ color: 'var(--color-dim)' }}>
      {icon}
      <span className="text-[0.65rem] tracking-[1.5px] uppercase font-semibold">{title}</span>
    </div>
  );
}

function Th({ children, align = 'left' }) {
  return (
    <th
      className={`py-2.5 px-4 text-${align} text-[0.5rem] font-bold tracking-[1.2px] uppercase`}
      style={{ color: 'var(--color-faint)' }}
    >
      {children}
    </th>
  );
}

function Td({ children, mono = false, align = 'left' }) {
  return (
    <td
      className={`py-2.5 px-4 text-${align} ${mono ? 'font-mono text-xs' : 'text-sm'}`}
      style={{ color: 'var(--color-text)' }}
    >
      {children}
    </td>
  );
}
