// AppShell — main authenticated view scaffold.
// Wires: TopBar, sidebar (VoyageTree), main (DetailPane). Boots the storage
// adapter:
//
//   • If VITE_DATA_REPO is set (e.g. "manolisar/voyage-tracker-data") we use
//     the GitHub adapter and the user's PAT (admin token) is required for any
//     network call. View-only with no token still renders the shell but list /
//     load operations will surface a "Connect to data repo" prompt.
//   • Otherwise we fall back to the local-file adapter so dev mode without
//     network still works against /public/data/.

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useVoyageStore } from '../../hooks/useVoyageStore';
import { loadShips, loadShipClass } from '../../domain/shipClass';
import { setStorageAdapter } from '../../storage/adapter';
import { localAdapter } from '../../storage/localAdapter';
import { createGithubAdapter } from '../../storage/github';
import { VoyageStoreProvider } from '../../contexts/VoyageStoreProvider';
import { TopBar } from './TopBar';
import { DetailPane } from './DetailPane';
import { VoyageTree } from '../tree/VoyageTree';
import { EditModeModal } from '../auth/EditModeModal';
import { PatEntryModal } from '../modals/PatEntryModal';
import { AdminPanel } from '../modals/AdminPanel';
import { NewVoyageModal } from '../modals/NewVoyageModal';
import { AddLegModal } from '../modals/AddLegModal';
import { VoyageEndModal } from '../modals/VoyageEndModal';
import { readRememberedPat } from '../../auth/patStorage';
import { ConflictModal } from '../modals/ConflictModal';
import { Eye, Cloud } from '../Icons';

// Read env once at module load. Vite inlines these.
const DATA_REPO   = import.meta.env?.VITE_DATA_REPO   || '';
const DATA_BRANCH = import.meta.env?.VITE_DATA_BRANCH || 'main';
const USE_GITHUB  = !!DATA_REPO;

function parseRepo(slug) {
  const [owner, repo] = (slug || '').split('/');
  return owner && repo ? { owner, repo } : null;
}

// ── Install the storage adapter SYNCHRONOUSLY at module load ──────────────
// React effects run child-first, so if we set the adapter inside a useEffect
// the VoyageTree's mount-time listVoyages() call lands BEFORE our effect
// fires → "Storage adapter not initialized". Install it before any render.
//
// The adapter needs a live token + editor role, but those are in React state.
// Solution: module-level mutables that the AppShell component pokes via
// effects below. The adapter's getToken/getEditorRole are closures over
// these, so PAT rotation never requires rebuilding the adapter.
let currentToken = null;
let currentEditorRole = 'Other';

if (USE_GITHUB) {
  const parsed = parseRepo(DATA_REPO);
  if (parsed) {
    setStorageAdapter(createGithubAdapter({
      owner:    parsed.owner,
      repo:     parsed.repo,
      branch:   DATA_BRANCH,
      getToken:      () => currentToken,
      getEditorRole: () => currentEditorRole,
    }));
  } else {
    console.error('[AppShell] VITE_DATA_REPO must look like "owner/repo"; got', DATA_REPO);
    setStorageAdapter(localAdapter);
  }
} else {
  // Dev mode without a data-repo env — read from /public/data/.
  setStorageAdapter(localAdapter);
}

export function AppShell() {
  const { shipId, editMode, editor, adminToken, setAdminPat } = useAuth();
  const [ship, setShip] = useState(null);
  const [shipClass, setShipClass] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [patModalOpen, setPatModalOpen] = useState(false);
  // Why the PAT modal is open. After a successful unlock we route the user to
  // whichever flow they were trying to start:
  //   'admin' — they clicked the gear → open Admin Panel.
  //   'edit'  — they clicked Enable Edit Mode → open EditModeModal.
  // (Plain 'connect' from the top-of-page banner falls through to nothing.)
  const [patReason, setPatReason] = useState('connect');
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [newVoyageOpen, setNewVoyageOpen] = useState(false);
  // VoyageDetail opens Add-Leg / End-Voyage modals by setting these to the
  // target voyage filename; null = closed. Centralizing them in AppShell
  // keeps the modal lifecycle outside the scrolling detail pane.
  const [addLegFor,   setAddLegFor]   = useState(null);
  const [endVoyageFor, setEndVoyageFor] = useState(null);

  // ── Keep the module-level adapter closures in sync with auth state ─────
  // The adapter was installed synchronously at module load (above) so that
  // first-render listVoyages() doesn't race. We also push token/role
  // assignments DURING RENDER (not in a useEffect) because React fires child
  // effects BEFORE parent effects. If this lived in a useEffect, then on a
  // PAT-rehydration tick, VoyageStoreProvider (a child) would re-run its
  // refreshList — keyed off `adminToken` — BEFORE this effect updated
  // `currentToken`, so the adapter would still see `null` and throw
  // AuthError. Render-time assignment is safe: these are closure-cache
  // mutables, not React state, and they end up at the same value either way
  // under StrictMode's double-render.
  currentToken      = adminToken;
  currentEditorRole = editor;

  // Re-hydrate a remembered PAT (sessionStorage) on first render.
  useEffect(() => {
    if (!USE_GITHUB || adminToken) return;
    const remembered = readRememberedPat();
    if (remembered) setAdminPat(remembered);
  }, [adminToken, setAdminPat]);

  // ── Load ship + class metadata ─────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    if (!shipId) return;
    (async () => {
      try {
        const ships = await loadShips();
        const s = ships.ships.find((x) => x.id === shipId) || null;
        if (!alive) return;
        setShip(s);
        if (s?.classId) {
          const cls = await loadShipClass(s.classId);
          if (alive) setShipClass(cls);
        }
      } catch (e) {
        console.error('Failed to load ship/class', e);
      }
    })();
    return () => { alive = false; };
  }, [shipId]);

  const sidebarStyle = useMemo(
    () => ({
      width: sidebarOpen ? 320 : 0,
      transition: 'width 0.2s ease',
      borderColor: 'var(--color-border-subtle)',
      background: 'var(--color-surface)',
    }),
    [sidebarOpen],
  );

  const needsPat = USE_GITHUB && !adminToken;

  return (
    <VoyageStoreProvider key={shipId}>
      <div className="flex flex-col flex-1 min-h-0">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <TopBar
          ship={ship}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          onOpenEditModal={() => {
            // Edit mode without a PAT is a dead end — saves can't reach the
            // repo. In GitHub mode, gate the PIN modal on having a token:
            // open the PAT modal first, then chain into EditModeModal on
            // success (see patModalOpen branch below). In local-adapter dev
            // mode there's no PAT at all → straight to the PIN modal.
            if (USE_GITHUB && !adminToken) {
              setPatReason('edit');
              setPatModalOpen(true);
            } else {
              setEditModalOpen(true);
            }
          }}
          onNewVoyage={() => setNewVoyageOpen(true)}
          onOpenAdmin={() => {
            // No PAT yet → ask for one. Otherwise open the real Admin Panel.
            // (When VITE_DATA_REPO is unset entirely we still surface the PAT
            // modal so the user gets a clear "not connected" message instead
            // of a silently broken Admin Panel.)
            if (!USE_GITHUB || !adminToken) {
              setPatReason('admin');
              setPatModalOpen(true);
            } else {
              setAdminPanelOpen(true);
            }
          }}
        />

        {needsPat && (
          <div
            className="px-4 py-2 text-xs flex items-center gap-2 border-b shrink-0"
            style={{
              background: 'var(--color-warn-bg)',
              color: 'var(--color-warn-fg)',
              borderColor: 'var(--color-border-subtle)',
            }}
            role="status"
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>
              Reading anonymously from the public data repo. <button className="underline font-semibold" onClick={() => { setPatReason('connect'); setPatModalOpen(true); }}>Connect a PAT</button> to enable Edit Mode.
            </span>
          </div>
        )}

        {!editMode && (
          <div
            className="px-4 py-2 text-xs flex items-center gap-2 border-b shrink-0"
            style={{
              background: 'var(--color-surface2)',
              color: 'var(--color-dim)',
              borderColor: 'var(--color-border-subtle)',
            }}
            role="status"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>You are in <strong>View Only</strong>. Click <strong>Enable Edit Mode</strong> in the top bar to modify data.</span>
          </div>
        )}

        <div className="flex flex-1 min-h-0">
          <aside
            className="border-r overflow-hidden shrink-0 hidden md:flex flex-col"
            style={sidebarStyle}
            aria-label="Voyages"
          >
            {sidebarOpen && <VoyageTree />}
          </aside>

          <main id="main-content" className="flex-1 min-h-0 overflow-y-auto p-6 md:p-8" tabIndex={-1}>
            <DetailPane
              ship={ship}
              shipClass={shipClass}
              onAddLeg={(filename) => setAddLegFor(filename)}
              onEndVoyage={(filename) => setEndVoyageFor(filename)}
            />
          </main>
        </div>

        {editModalOpen && (
          <EditModeModal
            shipDisplayName={ship?.displayName || 'this ship'}
            onClose={() => setEditModalOpen(false)}
          />
        )}

        {patModalOpen && (
          <PatEntryModal
            onClose={() => setPatModalOpen(false)}
            onUnlocked={() => {
              // Route to whichever flow the user was originally trying to
              // start. 'connect' (banner) just connects and stops there.
              if (patReason === 'admin') setAdminPanelOpen(true);
              else if (patReason === 'edit') setEditModalOpen(true);
              setPatReason('connect');
            }}
          />
        )}

        {adminPanelOpen && (
          <AdminPanel onClose={() => setAdminPanelOpen(false)} />
        )}

        {newVoyageOpen && (
          <NewVoyageModal
            shipClass={shipClass}
            onClose={() => setNewVoyageOpen(false)}
          />
        )}

        {addLegFor && (
          <AddLegModal
            filename={addLegFor}
            shipClass={shipClass}
            onClose={() => setAddLegFor(null)}
          />
        )}

        {endVoyageFor && (
          <VoyageEndModal
            filename={endVoyageFor}
            shipClass={shipClass}
            onClose={() => setEndVoyageFor(null)}
          />
        )}

        <ConflictModalHost />
      </div>
    </VoyageStoreProvider>
  );
}

// ConflictModal needs the VoyageStore context, so it lives below the provider.
function ConflictModalHost() {
  const { conflict, reloadFromRemote, forceOverwrite, cancelConflict, voyages } = useVoyageStore();
  if (!conflict) return null;
  const entry = voyages.find((v) => v.filename === conflict.filename);
  const label = entry ? `${entry.startDate || ''} ${entry.name || ''}`.trim() : null;
  return (
    <ConflictModal
      filename={conflict.filename}
      voyageLabel={label}
      onReload={reloadFromRemote}
      onForce={forceOverwrite}
      onCancel={cancelConflict}
    />
  );
}
