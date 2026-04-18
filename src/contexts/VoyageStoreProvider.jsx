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
import { defaultVoyage, defaultLeg, defaultVoyageEnd } from '../domain/factories';
import { VoyageStoreContext } from './VoyageStoreContext';

// Build the on-disk filename from the voyage name + start date:
//   2026-04-18_Singapore_to_Hong_Kong.json
// Must survive the path-safety regex `/^[A-Za-z0-9._-]+$/` in contents.js,
// so we replace anything non-alphanumeric with an underscore and collapse runs.
function slugify(s) {
  return (s || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);
}
function buildFilename(startDate, name) {
  const slug = slugify(name) || 'voyage';
  const date = (startDate || '').trim() || new Date().toISOString().slice(0, 10);
  return `${date}_${slug}.json`;
}

function manifestEntryFrom(voyage) {
  return {
    filename: voyage.filename,
    id: voyage.id,
    name: voyage.name || '',
    startDate: voyage.startDate || '',
    endDate: voyage.endDate || '',
    ended: !!voyage.voyageEnd,
  };
}

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
  // Manual carry-over source. Set whenever the user enters an END value in a
  // phase's equipment row. Shape:
  //   { filename, legId, kind: 'departure'|'arrival', phaseId, phaseName,
  //     equipment: { [equipKey]: endValue } }
  const [lastEditedPhase, setLastEditedPhase] = useState(null);

  // One pending-save timer per filename.
  const saveTimers = useRef(new Map());
  // Per-filename "save currently in flight" flag. Used to serialize saves so
  // that a debounce timer that fires while the previous save hasn't returned
  // yet doesn't PUT with the stale sha (which would 409 → ConflictModal).
  const inFlight = useRef(new Set());
  // Trampoline ref so the in-flight reschedule always calls the latest
  // `flushSave` — avoids a self-referential useCallback + stale-closure lint
  // error when we `setTimeout(() => flushSave(...), 250)` from inside flushSave.
  const flushSaveRef = useRef(null);
  // Mirror of `voyages` for access inside async callbacks (flushSave), which
  // can't rely on closed-over state because they run after the save round-trip.
  const voyagesRef = useRef(voyages);
  useEffect(() => { voyagesRef.current = voyages; }, [voyages]);
  // Same pattern for shaById: autosave timers capture `flushSave` at schedule
  // time, so during a quick burst of edits timer-B's closure still sees the
  // stale sha from BEFORE timer-A's save returned. Reading from a ref
  // sidesteps the race so every save uses the freshest sha we know about.
  const shaByIdRef = useRef(shaById);
  useEffect(() => { shaByIdRef.current = shaById; }, [shaById]);
  // Same for drafts — flushSave needs the latest draft, not a stale snapshot.
  const draftsRef = useRef(drafts);
  useEffect(() => { draftsRef.current = drafts; }, [drafts]);

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
    // Read draft + sha from refs, not closures. Autosave timers capture
    // `flushSave` at schedule time; during a fast edit burst the old closure
    // could otherwise PUT with a sha that's already been superseded by a
    // still-in-flight save. That would manifest as a spurious conflict modal.
    const draft = draftsRef.current[filename];
    if (!draft) return;
    // If a save is already in flight for this file, don't overlap — reschedule
    // ourselves once that save returns. Otherwise two PUTs would race with the
    // same stale sha and one would 409. See scheduleSave below.
    if (inFlight.current.has(filename)) {
      const timers = saveTimers.current;
      if (timers.has(filename)) clearTimeout(timers.get(filename));
      const t = setTimeout(() => {
        timers.delete(filename);
        flushSaveRef.current?.(filename, { forceOverwrite });
      }, 250);
      timers.set(filename, t);
      return;
    }
    inFlight.current.add(filename);
    setSaving((prev) => {
      const n = new Set(prev); n.add(filename); return n;
    });
    try {
      const stamped = { ...draft, lastModified: new Date().toISOString() };
      const prevSha = forceOverwrite ? null : (shaByIdRef.current[filename] || null);
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

      // Manifest sync: if any manifest-level field changed (name / dates /
      // ended), upsert _index.json and refresh our local `voyages` state.
      // Fire-and-forget — a failed index write isn't fatal; the next listing
      // will fall back to directory enumeration.
      const freshEntry = manifestEntryFrom(stamped);
      const existing = voyagesRef.current.find((v) => v.filename === filename);
      const manifestChanged = !existing
        || existing.name !== freshEntry.name
        || existing.startDate !== freshEntry.startDate
        || existing.endDate !== freshEntry.endDate
        || !!existing.ended !== freshEntry.ended;
      if (manifestChanged) {
        setVoyages((list) => {
          const without = list.filter((v) => v.filename !== filename);
          return [...without, freshEntry].sort((a, b) =>
            (b.startDate || '').localeCompare(a.startDate || ''));
        });
        const upsert = getStorageAdapter().upsertIndex;
        if (typeof upsert === 'function') {
          upsert(shipId, filename, freshEntry).catch((err) =>
            console.warn('[VoyageStore] _index.json upsert failed (non-fatal)', err),
          );
        }
      }
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
      inFlight.current.delete(filename);
      setSaving((prev) => {
        if (!prev.has(filename)) return prev;
        const n = new Set(prev); n.delete(filename); return n;
      });
    }
  }, [shipId]);
  // Keep the trampoline ref aligned with the current flushSave closure.
  useEffect(() => { flushSaveRef.current = flushSave; }, [flushSave]);

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

  // Create a new voyage file. `partial` carries user-supplied fields from the
  // NewVoyageModal; we fill the rest from the ship-class defaults.
  //
  //   partial = { name, startDate, endDate?, shipClass }
  //
  // Returns the new filename so callers can select it.
  const createVoyage = useCallback(async (partial) => {
    if (!shipId) throw new Error('createVoyage: no shipId');
    if (!partial?.shipClass) throw new Error('createVoyage: shipClass required');
    if (!partial?.name?.trim()) throw new Error('createVoyage: name required');

    const filename = buildFilename(partial.startDate, partial.name);
    const base = defaultVoyage(shipId, partial.shipClass);
    const voyage = {
      ...base,
      name: partial.name.trim(),
      startDate: partial.startDate || '',
      endDate: partial.endDate || '',
      filename,
      lastModified: new Date().toISOString(),
    };

    // Brand-new file → no prevSha. GitHub returns 409 if the file already
    // exists under that name, which ConflictError surfaces to the caller.
    const { sha } = await getStorageAdapter().saveVoyage(shipId, filename, voyage, null);
    setLoadedById((s) => ({ ...s, [filename]: voyage }));
    if (sha) setShaById((s) => ({ ...s, [filename]: sha }));

    const entry = manifestEntryFrom(voyage);
    setVoyages((list) => {
      const without = list.filter((v) => v.filename !== filename);
      return [...without, entry].sort((a, b) =>
        (b.startDate || '').localeCompare(a.startDate || ''));
    });
    // Upsert index; fire-and-forget (directory listing is our safety net).
    const upsert = getStorageAdapter().upsertIndex;
    if (typeof upsert === 'function') {
      upsert(shipId, filename, entry).catch((err) =>
        console.warn('[VoyageStore] _index.json upsert failed (non-fatal)', err),
      );
    }

    // Expand + select the new voyage so the user lands on its detail page.
    setExpanded((prev) => {
      const next = new Set(prev); next.add(filename); return next;
    });
    setSelected({ filename, kind: 'voyage' });
    return filename;
  }, [shipId]);

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

  // Expand every voyage in the current list (top level). Leg-level expansion
  // stays user-driven — legs aren't known until the voyage is loaded.
  const expandAll = useCallback(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const v of voyages) next.add(v.filename);
      return next;
    });
  }, [voyages]);

  const collapseAll = useCallback(() => {
    setExpanded(new Set());
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

  // Add a new leg to a voyage. Options:
  //   shipClass      — required, factories use it for default equipment keys
  //   fromPort       — prefills leg.departure.port
  //   toPort         — prefills leg.arrival.port
  //   depDate        — prefills leg.departure.date
  //   arrDate        — prefills leg.arrival.date
  //   carryOverFrom  — a previous leg to copy equipment END → new leg's
  //                    departure START + arrival START (matches v6 behavior).
  const addLeg = useCallback((filename, {
    shipClass,
    fromPort = '',
    toPort = '',
    depDate = '',
    arrDate = '',
    carryOverFrom = null,
  }) => {
    if (!shipClass) throw new Error('addLeg: shipClass required');
    const leg = defaultLeg(shipClass);
    if (fromPort) leg.departure.port = fromPort;
    if (toPort)   leg.arrival.port   = toPort;
    if (depDate)  leg.departure.date = depDate;
    if (arrDate)  leg.arrival.date   = arrDate;

    if (carryOverFrom?.arrival?.phases) {
      // Copy last-phase `end` counters from the previous leg's arrival into
      // the new leg's departure + arrival starts, per v6's carry-over rule.
      const srcPhases = carryOverFrom.arrival.phases;
      const srcLast = srcPhases[srcPhases.length - 1];
      if (srcLast?.equipment) {
        for (const key of Object.keys(leg.departure.phases[0]?.equipment || {})) {
          const endVal = srcLast.equipment[key]?.end;
          if (endVal) leg.departure.phases[0].equipment[key].start = endVal;
        }
        for (const key of Object.keys(leg.arrival.phases[0]?.equipment || {})) {
          const endVal = srcLast.equipment[key]?.end;
          if (endVal) leg.arrival.phases[0].equipment[key].start = endVal;
        }
      }
    }

    updateVoyage(filename, (v) => ({ ...v, legs: [...(v.legs || []), leg] }));
    // Expand the new leg so the user can see Dep/Arr right away, and select
    // its Departure — that's almost always the next field they'll edit.
    const key = `${filename}::${leg.id}`;
    setExpanded((prev) => {
      const next = new Set(prev); next.add(key); next.add(filename); return next;
    });
    setSelected({ filename, kind: 'departure', legId: leg.id });
    return leg.id;
  }, [updateVoyage]);

  // End a voyage. Writes voyage.voyageEnd + voyage.endDate, which triggers a
  // manifest sync inside flushSave. Selects the Voyage End node.
  const endVoyage = useCallback((filename, {
    shipClass,
    endDate = '',
    engineer = '',
    notes = '',
    lubeOil = null,
  }) => {
    if (!shipClass) throw new Error('endVoyage: shipClass required');
    const nowDate = endDate || new Date().toISOString().slice(0, 10);
    updateVoyage(filename, (v) => ({
      ...v,
      endDate: nowDate,
      voyageEnd: {
        ...defaultVoyageEnd(shipClass),
        completedAt: new Date().toISOString(),
        engineer,
        notes,
        lubeOil: lubeOil || defaultVoyageEnd(shipClass).lubeOil,
      },
    }));
    setSelected({ filename, kind: 'voyageEnd' });
  }, [updateVoyage]);

  // ── Manual carry-over (phase END → next phase START) ──────────────────
  // v7 keeps v6's manual-only model: the engineer edits END counters in a
  // phase, then clicks FloatingCarryOverButton → ManualCarryOverModal to push
  // selected values into the next phase's START.
  //
  // trackPhaseEnd — called from DetailPane when it detects that an equipment
  // .end field changed. Stamps `lastEditedPhase` so the floating button knows
  // where the carry-over is coming from.
  const trackPhaseEnd = useCallback((source) => {
    if (!source) { setLastEditedPhase(null); return; }
    setLastEditedPhase(source);
  }, []);

  // Walk: within-report next phase → dep→arrival within same leg → arrival
  // of leg N → departure of leg N+1. Returns a "target" descriptor for the
  // modal (or null when there is no next phase).
  const findNextPhaseFor = useCallback((source) => {
    if (!source) return null;
    // Use drafts/loadedById directly — effectiveById is declared below us and
    // would trip TDZ if we referenced it here.
    const v = drafts[source.filename] || loadedById[source.filename];
    if (!v) return null;
    const legIdx = v.legs.findIndex((l) => l.id === source.legId);
    if (legIdx < 0) return null;
    const leg = v.legs[legIdx];
    const report = source.kind === 'departure' ? leg.departure : leg.arrival;
    if (!report?.phases) return null;
    const phaseIdx = report.phases.findIndex((p) => p.id === source.phaseId);
    if (phaseIdx < 0) return null;

    const buildTarget = (destLegId, destKind, destPhase) => ({
      filename: source.filename,
      legId: destLegId,
      kind: destKind,
      phaseId: destPhase.id,
      phaseName: destPhase.name || (destKind === 'departure' ? 'Departure Phase' : 'Arrival Phase'),
    });

    // Next phase within the same report.
    if (phaseIdx < report.phases.length - 1) {
      return buildTarget(leg.id, source.kind, report.phases[phaseIdx + 1]);
    }
    // Departure → first arrival phase of the same leg.
    if (source.kind === 'departure' && leg.arrival?.phases?.length > 0) {
      return buildTarget(leg.id, 'arrival', leg.arrival.phases[0]);
    }
    // Arrival (last phase) → first departure phase of the next leg.
    if (source.kind === 'arrival' && legIdx < v.legs.length - 1) {
      const nextLeg = v.legs[legIdx + 1];
      const destPhase = nextLeg?.departure?.phases?.[0];
      if (destPhase) return buildTarget(nextLeg.id, 'departure', destPhase);
    }
    return null;
  }, [drafts, loadedById]);

  // applyCarryOver — copy the chosen END values into `target`'s phase START
  // fields. `counters` = { [equipKey]: value }.
  const applyCarryOver = useCallback((target, counters) => {
    if (!target) return;
    const entries = Object.entries(counters || {}).filter(([, v]) => v !== '' && v != null);
    if (!entries.length) return;
    updateVoyage(target.filename, (v) => ({
      ...v,
      legs: v.legs.map((l) => {
        if (l.id !== target.legId) return l;
        const rep = target.kind === 'departure' ? l.departure : l.arrival;
        if (!rep?.phases) return l;
        const nextPhases = rep.phases.map((p) => {
          if (p.id !== target.phaseId) return p;
          const eqNext = { ...p.equipment };
          for (const [key, val] of entries) {
            if (eqNext[key]) eqNext[key] = { ...eqNext[key], start: String(val) };
          }
          return { ...p, equipment: eqNext };
        });
        return target.kind === 'departure'
          ? { ...l, departure: { ...rep, phases: nextPhases } }
          : { ...l, arrival:   { ...rep, phases: nextPhases } };
      }),
    }));
    setLastEditedPhase(null);
  }, [updateVoyage]);

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
    createVoyage,
    addLeg,
    endVoyage,
    discardDraft,
    flushSave,
    // carry-over
    lastEditedPhase,
    trackPhaseEnd,
    findNextPhaseFor,
    applyCarryOver,
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
    expandAll,
    collapseAll,
    // queries
    filter, setFilter,
    search, setSearch,
    // actions
    refreshList,
    loadVoyage,
  }), [
    voyages, visibleVoyages, effectiveById, loadingFiles, listLoading, listError,
    dirty, saving, updateVoyage, createVoyage, addLeg, endVoyage, discardDraft, flushSave,
    lastEditedPhase, trackPhaseEnd, findNextPhaseFor, applyCarryOver,
    conflict, reloadFromRemote, forceOverwrite, cancelConflict,
    selected, expanded, select, toggleExpand, expand, expandAll, collapseAll,
    filter, search,
    refreshList, loadVoyage,
  ]);

  return <VoyageStoreContext.Provider value={value}>{children}</VoyageStoreContext.Provider>;
}
