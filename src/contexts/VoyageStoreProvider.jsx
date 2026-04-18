// VoyageStoreProvider — owns:
//   - voyage list (the manifest entries from listVoyages)
//   - lazy cache of fully-loaded voyages keyed by filename
//   - SHA cache (optimistic-concurrency tokens) keyed by filename
//   - dirty edit drafts keyed by filename (Phase 5)
//   - tree expansion set (filenames that are expanded in the sidebar)
//   - currently-selected node (filename + which inner node)
//   - pending conflict (Phase 3) — surfaces ConflictModal
//
// Re-loads the list whenever shipId changes.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getStorageAdapter, ConflictError } from '../storage/adapter';
import { safePutDraft, safeDeleteDraft } from '../storage/indexeddb';
import { AUTO_SAVE_DELAY_MS } from '../domain/constants';
import { VoyageStoreContext } from './VoyageStoreContext';

// Selection shape:
//   { filename, kind: 'voyage'|'leg'|'departure'|'arrival'|'voyageReport'|'voyageEnd', legId? }
// `kind: 'voyage'` => the Voyage Detail node
// `kind: 'leg'`    => the leg header (no detail, just a focusable container)
// others           => specific report nodes inside a leg.

function emptySelection() { return null; }

export function VoyageStoreProvider({ children }) {
  const { shipId } = useAuth();

  const [voyages, setVoyages] = useState([]);     // manifest entries
  const [loadedById, setLoadedById] = useState({}); // { [filename]: voyageObj }  (last clean snapshot)
  const [shaById, setShaById] = useState({});      // { [filename]: githubSha }
  const [drafts, setDrafts] = useState({});         // { [filename]: voyageObj }  (working copy when dirty)
  const [dirty, setDirty] = useState(() => new Set()); // filenames with unsaved edits
  const [saving, setSaving] = useState(() => new Set()); // filenames currently being saved
  const [loadingFiles, setLoadingFiles] = useState({}); // { [filename]: true }
  const [expanded, setExpanded] = useState(() => new Set());
  const [selected, setSelected] = useState(emptySelection);
  const [filter, setFilter] = useState('all'); // 'active' | 'ended' | 'all'
  const [search, setSearch] = useState('');
  const [listError, setListError] = useState(null);
  const [listLoading, setListLoading] = useState(false);
  // Pending conflict, surfaces <ConflictModal>. Shape: { filename } or null.
  const [conflict, setConflict] = useState(null);

  // One pending-save timer per filename.
  const saveTimers = useRef(new Map());

  // Refresh the manifest from the adapter.
  const refreshList = useCallback(async () => {
    if (!shipId) {
      setVoyages([]);
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const list = await getStorageAdapter().listVoyages(shipId);
      setVoyages(list);
    } catch (e) {
      setListError(e.message || String(e));
    } finally {
      setListLoading(false);
    }
  }, [shipId]);

  // Load manifest on mount. The provider is `key`'d on shipId by AppShell, so
  // a ship switch unmounts/remounts this provider with fresh state — no reset
  // effect is needed. This is a legitimate "fetch on mount" side effect; the
  // setState calls happen INSIDE the async refreshList, not synchronously in
  // the effect body, but the lint rule still flags it. Disable narrowly.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refreshList(); }, [refreshList]);

  // Lazy-load a voyage's full data on first access (or when explicitly asked).
  const loadVoyage = useCallback(async (filename) => {
    if (!shipId || !filename) return null;
    if (loadedById[filename]) return loadedById[filename];
    if (loadingFiles[filename]) return null;
    setLoadingFiles((s) => ({ ...s, [filename]: true }));
    try {
      const { voyage, sha } = await getStorageAdapter().loadVoyage(shipId, filename);
      setLoadedById((s) => ({ ...s, [filename]: voyage }));
      if (sha) setShaById((s) => ({ ...s, [filename]: sha }));
      return voyage;
    } finally {
      setLoadingFiles((s) => {
        const n = { ...s }; delete n[filename]; return n;
      });
    }
  }, [shipId, loadedById, loadingFiles]);

  // ── Editing ──────────────────────────────────────────────────────────────

  // Save-now flush. Called by the debounced timer or imperatively.
  // `forceOverwrite` (default false) drops the prevSha so the next save will
  // clobber the remote — used by the "Force overwrite" branch of ConflictModal.
  const flushSave = useCallback(async (filename, { forceOverwrite = false } = {}) => {
    const draft = drafts[filename];
    if (!draft) return;
    setSaving((prev) => {
      const n = new Set(prev); n.add(filename); return n;
    });
    try {
      const stamped = { ...draft, lastModified: new Date().toISOString() };
      const prevSha = forceOverwrite ? null : (shaById[filename] || null);
      const { sha } = await getStorageAdapter().saveVoyage(shipId, filename, stamped, prevSha);
      // Promote draft → loaded snapshot, clear dirty + offline cache.
      setLoadedById((s) => ({ ...s, [filename]: stamped }));
      if (sha) setShaById((s) => ({ ...s, [filename]: sha }));
      setDrafts((d) => {
        const n = { ...d }; delete n[filename]; return n;
      });
      setDirty((prev) => {
        if (!prev.has(filename)) return prev;
        const n = new Set(prev); n.delete(filename); return n;
      });
      safeDeleteDraft(shipId, filename);
    } catch (e) {
      if (e instanceof ConflictError) {
        // Surface the modal — don't auto-resolve.
        setConflict({ filename });
      } else {
        // Network / rate-limit / auth: keep the draft in IDB so a refresh
        // doesn't lose work, then re-throw via console.
        safePutDraft(shipId, filename, draft);
        console.error('[VoyageStore] save failed', filename, e);
      }
    } finally {
      setSaving((prev) => {
        if (!prev.has(filename)) return prev;
        const n = new Set(prev); n.delete(filename); return n;
      });
    }
  }, [drafts, shipId, shaById]);

  // Schedule a debounced save for `filename`. Resets the timer on each call.
  const scheduleSave = useCallback((filename) => {
    const timers = saveTimers.current;
    if (timers.has(filename)) clearTimeout(timers.get(filename));
    const t = setTimeout(() => {
      timers.delete(filename);
      flushSave(filename);
    }, AUTO_SAVE_DELAY_MS);
    timers.set(filename, t);
  }, [flushSave]);

  // Replace the working copy of a voyage. Marks dirty + schedules autosave.
  const updateVoyage = useCallback((filename, mutator) => {
    if (!filename) return;
    setDrafts((prev) => {
      const base = prev[filename] ?? loadedById[filename];
      if (!base) return prev;
      const next = typeof mutator === 'function' ? mutator(base) : mutator;
      if (next === base) return prev;
      // Best-effort offline mirror.
      safePutDraft(shipId, filename, next);
      return { ...prev, [filename]: next };
    });
    setDirty((prev) => {
      if (prev.has(filename)) return prev;
      const n = new Set(prev); n.add(filename); return n;
    });
    scheduleSave(filename);
  }, [loadedById, scheduleSave, shipId]);

  // Discard local edits.
  const discardDraft = useCallback((filename) => {
    const timers = saveTimers.current;
    if (timers.has(filename)) { clearTimeout(timers.get(filename)); timers.delete(filename); }
    setDrafts((d) => {
      if (!(filename in d)) return d;
      const n = { ...d }; delete n[filename]; return n;
    });
    setDirty((prev) => {
      if (!prev.has(filename)) return prev;
      const n = new Set(prev); n.delete(filename); return n;
    });
    safeDeleteDraft(shipId, filename);
  }, [shipId]);

  // ── Conflict resolution helpers (used by ConflictModal) ─────────────────

  const reloadFromRemote = useCallback(async () => {
    const filename = conflict?.filename;
    if (!filename) return;
    // Drop the local draft and refetch.
    discardDraft(filename);
    setLoadedById((s) => { const n = { ...s }; delete n[filename]; return n; });
    setShaById((s) => { const n = { ...s }; delete n[filename]; return n; });
    setConflict(null);
    await loadVoyage(filename);
  }, [conflict, discardDraft, loadVoyage]);

  const forceOverwrite = useCallback(async () => {
    const filename = conflict?.filename;
    if (!filename) return;
    setConflict(null);
    await flushSave(filename, { forceOverwrite: true });
  }, [conflict, flushSave]);

  const cancelConflict = useCallback(() => setConflict(null), []);

  // Cleanup any pending timers when this provider unmounts (ship switch).
  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  // ── Selection / expansion ───────────────────────────────────────────────

  const toggleExpand = useCallback((key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const expand = useCallback((key) => {
    setExpanded((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  // Select + auto-expand the parent voyage so the user always sees the path.
  const select = useCallback(async (sel) => {
    setSelected(sel);
    if (sel?.filename) {
      expand(sel.filename);
      // Pre-load the voyage if we don't have it yet (don't block the UI).
      if (!loadedById[sel.filename]) loadVoyage(sel.filename);
    }
  }, [expand, loadedById, loadVoyage]);

  // Filtered + searched view of the manifest.
  const visibleVoyages = useMemo(() => {
    const q = search.trim().toLowerCase();
    return voyages.filter((v) => {
      if (filter === 'active' && v.ended) return false;
      if (filter === 'ended'  && !v.ended) return false;
      if (q) {
        const hay = `${v.name || ''} ${v.startDate || ''} ${v.endDate || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [voyages, filter, search]);

  // Effective voyage data per filename: draft if dirty, else loaded snapshot.
  // We expose loadedById merged with drafts so consumers reading
  // `loadedById[filename]` always get the freshest version on screen.
  const effectiveById = useMemo(() => {
    if (!Object.keys(drafts).length) return loadedById;
    return { ...loadedById, ...drafts };
  }, [loadedById, drafts]);

  const value = useMemo(() => ({
    // data
    voyages,
    visibleVoyages,
    loadedById: effectiveById,
    loadingFiles,
    listLoading,
    listError,
    // editing
    dirty,
    saving,
    updateVoyage,
    discardDraft,
    flushSave,
    // conflict
    conflict,
    reloadFromRemote,
    forceOverwrite,
    cancelConflict,
    // selection / expansion
    selected,
    expanded,
    select,
    toggleExpand,
    expand,
    // queries
    filter, setFilter,
    search, setSearch,
    // actions
    refreshList,
    loadVoyage,
  }), [
    voyages, visibleVoyages, effectiveById, loadingFiles, listLoading, listError,
    dirty, saving, updateVoyage, discardDraft, flushSave,
    conflict, reloadFromRemote, forceOverwrite, cancelConflict,
    selected, expanded, select, toggleExpand, expand,
    filter, search,
    refreshList, loadVoyage,
  ]);

  return <VoyageStoreContext.Provider value={value}>{children}</VoyageStoreContext.Provider>;
}
