// IndexedDB — four stores, one DB.
//
//   `drafts`      keyed by `<shipId>/<filename>` — offline fallback for saves
//                 that couldn't reach the network drive. Mirrored from the
//                 in-memory draft map in VoyageStoreProvider; re-hydrated on
//                 startup and flushed on the next successful save.
//
//   `handles`     keyed by shipId — persisted FileSystemDirectoryHandle for
//                 each ship's network folder. Lets us skip the folder-picker
//                 on every tab reload; re-permissioning is a silent call on
//                 Chromium when the same handle is requested on same-origin.
//
//   `session`     keyed by 'current' — last picked ship + user name + role, so
//                 a tab refresh restores the session without making the user
//                 re-type their name. editMode is NOT persisted — always starts
//                 false on reload (accident-prevention default).
//
//   `customPorts` keyed by shipId — ports typed into the New Voyage modal
//                 that weren't in the shipped UN/LOCODE catalog. Lets the
//                 autocomplete remember obscure ports across sessions without
//                 requiring a catalog rebuild + redeploy.
//
//   `shipSettings` keyed by shipId — per-ship overrides the crew can tweak
//                 from Settings (currently: default fuel densities). Applied
//                 at voyage creation on top of the shipClass baseline.

const DB_NAME = 'VoyageTrackerV7';
const DB_VERSION = 5;
const STORE_DRAFTS = 'drafts';
const STORE_HANDLES = 'handles';
const STORE_SESSION = 'session';
const STORE_CUSTOM_PORTS = 'customPorts';
const STORE_SHIP_SETTINGS = 'shipSettings';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === 'undefined') {
    dbPromise = Promise.reject(new Error('IndexedDB not available'));
    return dbPromise;
  }
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      // v1 → v2: `handles` store added.
      // v2 → v3: `session` store added. `drafts` keeps its shape throughout.
      // v3 → v4: `customPorts` store added.
      // v4 → v5: `shipSettings` store added (per-ship density overrides).
      if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
        db.createObjectStore(STORE_DRAFTS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_HANDLES)) {
        db.createObjectStore(STORE_HANDLES, { keyPath: 'shipId' });
      }
      if (!db.objectStoreNames.contains(STORE_SESSION)) {
        db.createObjectStore(STORE_SESSION, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_CUSTOM_PORTS)) {
        db.createObjectStore(STORE_CUSTOM_PORTS, { keyPath: 'shipId' });
      }
      if (!db.objectStoreNames.contains(STORE_SHIP_SETTINGS)) {
        db.createObjectStore(STORE_SHIP_SETTINGS, { keyPath: 'shipId' });
      }
      void ev;
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'));
  });
  return dbPromise;
}

function tx(storeName, mode = 'readonly') {
  return openDb().then((db) => {
    const t = db.transaction(storeName, mode);
    return t.objectStore(storeName);
  });
}

const keyOf = (shipId, filename) => `${shipId}/${filename}`;

// ── Drafts (offline fallback) ────────────────────────────────────────────

export async function putDraft(shipId, filename, voyage) {
  const store = await tx(STORE_DRAFTS, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put({
      key: keyOf(shipId, filename),
      shipId,
      filename,
      voyage,
      updatedAt: Date.now(),
    });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function deleteDraft(shipId, filename) {
  const store = await tx(STORE_DRAFTS, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(keyOf(shipId, filename));
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function listDraftsForShip(shipId) {
  const store = await tx(STORE_DRAFTS);
  return new Promise((resolve, reject) => {
    const out = [];
    const req = store.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return resolve(out);
      if (cur.value?.shipId === shipId) out.push(cur.value);
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function clearAll() {
  for (const storeName of [STORE_DRAFTS, STORE_HANDLES, STORE_SESSION, STORE_CUSTOM_PORTS, STORE_SHIP_SETTINGS]) {
    const store = await tx(storeName, 'readwrite');
    await new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

// Best-effort wrapper — never let IDB hiccups break a save.
export async function safePutDraft(shipId, filename, voyage) {
  try { await putDraft(shipId, filename, voyage); }
  catch (e) { console.warn('[idb] putDraft failed', e); }
}
export async function safeDeleteDraft(shipId, filename) {
  try { await deleteDraft(shipId, filename); }
  catch (e) { console.warn('[idb] deleteDraft failed', e); }
}

// ── Directory handles (persist `showDirectoryPicker` result per ship) ────
// FileSystemDirectoryHandle is structured-cloneable on Chromium, so IDB can
// store it verbatim. Permission state does NOT persist — callers must still
// call `handle.requestPermission()` on each app launch.

export async function putDirHandle(shipId, handle) {
  const store = await tx(STORE_HANDLES, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put({ shipId, handle, updatedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getDirHandle(shipId) {
  const store = await tx(STORE_HANDLES);
  return new Promise((resolve, reject) => {
    const req = store.get(shipId);
    req.onsuccess = () => resolve(req.result?.handle || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteDirHandle(shipId) {
  const store = await tx(STORE_HANDLES, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(shipId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function listDirHandles() {
  const store = await tx(STORE_HANDLES);
  return new Promise((resolve, reject) => {
    const out = [];
    const req = store.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return resolve(out);
      out.push({ shipId: cur.value.shipId, handle: cur.value.handle, updatedAt: cur.value.updatedAt });
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

// ── Session (ship + user name + role) ────────────────────────────────────
// Single row with id='current'. Restored on app mount so a tab refresh
// doesn't force re-picking the ship and re-typing the user's name.

const SESSION_ID = 'current';

export async function putSession(session) {
  const store = await tx(STORE_SESSION, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put({ id: SESSION_ID, ...session, updatedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getSession() {
  const store = await tx(STORE_SESSION);
  return new Promise((resolve, reject) => {
    const req = store.get(SESSION_ID);
    req.onsuccess = () => {
      const row = req.result;
      if (!row) return resolve(null);
      // Strip internal fields before returning to caller.
      // eslint-disable-next-line no-unused-vars
      const { id, updatedAt, ...rest } = row;
      resolve(rest);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function clearSession() {
  const store = await tx(STORE_SESSION, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(SESSION_ID);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── Custom ports (per-ship user additions outside the shipped catalog) ───

export async function getCustomPorts(shipId) {
  if (!shipId) return [];
  const store = await tx(STORE_CUSTOM_PORTS);
  return new Promise((resolve, reject) => {
    const req = store.get(shipId);
    req.onsuccess = () => resolve(req.result?.ports || []);
    req.onerror = () => reject(req.error);
  });
}

export async function addCustomPort(shipId, port) {
  if (!shipId || !port?.code) return;
  const existing = await getCustomPorts(shipId);
  const upper = port.code.toUpperCase();
  // De-dup by code; newer wins on conflict.
  const next = [
    ...existing.filter((p) => p.code !== upper),
    { code: upper, name: port.name || '', country: (port.country || '').toUpperCase(), locode: port.locode || '' },
  ];
  const store = await tx(STORE_CUSTOM_PORTS, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put({ shipId, ports: next, updatedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── Ship settings (per-ship overrides edited from Settings) ──────────────

export async function getShipSettings(shipId) {
  if (!shipId) return {};
  const store = await tx(STORE_SHIP_SETTINGS);
  return new Promise((resolve, reject) => {
    const req = store.get(shipId);
    req.onsuccess = () => {
      const row = req.result;
      if (!row) return resolve({});
      const { shipId: _s, updatedAt: _u, ...rest } = row;
      void _s; void _u;
      resolve(rest);
    };
    req.onerror = () => reject(req.error);
  });
}

// Shallow-merges `patch` onto the existing settings row so callers can
// update one field at a time without round-tripping the whole object.
export async function putShipSettings(shipId, patch) {
  if (!shipId) return;
  const current = await getShipSettings(shipId);
  const next = { ...current, ...patch };
  const store = await tx(STORE_SHIP_SETTINGS, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put({ shipId, ...next, updatedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
