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

import { useEffect, useMemo, useRef, useState } from 'react';
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

// Default to local adapter so dev without env works.
if (!USE_GITHUB) setStorageAdapter(localAdapter);

export function AppShell() {
  const { shipId, editMode, editor, adminToken, setAdminPat } = useAuth();
  const [ship, setShip] = useState(null);
  const [shipClass, setShipClass] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [patModalOpen, setPatModalOpen] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);

  // ── Boot the GitHub adapter once (if configured) ───────────────────────
  // We build the adapter ONCE; getToken is a closure over a ref so PAT
  // rotation doesn't require rebuilding the adapter.
  const tokenRef = useRef(adminToken);
  const editorRef = useRef(editor);
  useEffect(() => { tokenRef.current = adminToken; }, [adminToken]);
  useEffect(() => { editorRef.current = editor; }, [editor]);

  useEffect(() => {
    if (!USE_GITHUB) return;
    const parsed = parseRepo(DATA_REPO);
    if (!parsed) {
      console.error('[AppShell] VITE_DATA_REPO must look like "owner/repo"; got', DATA_REPO);
      setStorageAdapter(localAdapter);
      return;
    }
    setStorageAdapter(createGithubAdapter({
      owner:    parsed.owner,
      repo:     parsed.repo,
      branch:   DATA_BRANCH,
      getToken: () => tokenRef.current,
      getEditorRole: () => editorRef.current,
    }));
  }, []);

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
          onOpenEditModal={() => setEditModalOpen(true)}
          onOpenAdmin={() => {
            // No PAT yet → ask for one. Otherwise open the real Admin Panel.
            // (When VITE_DATA_REPO is unset entirely we still surface the PAT
            // modal so the user gets a clear "not connected" message instead
            // of a silently broken Admin Panel.)
            if (!USE_GITHUB || !adminToken) setPatModalOpen(true);
            else setAdminPanelOpen(true);
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
              Not connected to data repo. <button className="underline font-semibold" onClick={() => setPatModalOpen(true)}>Connect</button> to load voyages.
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
            <DetailPane ship={ship} shipClass={shipClass} />
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
              // Once the user successfully connects, jump straight into the
              // Admin Panel — that's almost always why they clicked the gear.
              setAdminPanelOpen(true);
            }}
          />
        )}

        {adminPanelOpen && (
          <AdminPanel onClose={() => setAdminPanelOpen(false)} />
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
