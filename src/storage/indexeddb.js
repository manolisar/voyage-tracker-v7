// IndexedDB — two stores, one DB.
//
//   `drafts`  keyed by `<shipId>/<filename>` — offline fallback for saves
//             that couldn't reach the network drive. Mirrored from the
//             in-memory draft map in VoyageStoreProvider; re-hydrated on
//             startup and flushed on the next successful save.
//
//   `handles` keyed by shipId — persisted FileSystemDirectoryHandle for
//             each ship's network folder. Lets us skip the folder-picker
//             on every tab reload; re-permissioning is a silent call on
//             Chromium when the same handle is requested on same-origin.

const DB_NAME = 'VoyageTrackerV7';
const DB_VERSION = 2;
const STORE_DRAFTS = 'drafts';
const STORE_HANDLES = 'handles';

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
      // v1 → v2: `handles` store added. `drafts` keeps its shape.
      if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
        db.createObjectStore(STORE_DRAFTS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_HANDLES)) {
        db.createObjectStore(STORE_HANDLES, { keyPath: 'shipId' });
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
  const drafts = await tx(STORE_DRAFTS, 'readwrite');
  await new Promise((resolve, reject) => {
    const req = drafts.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  const handles = await tx(STORE_HANDLES, 'readwrite');
  await new Promise((resolve, reject) => {
    const req = handles.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
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
