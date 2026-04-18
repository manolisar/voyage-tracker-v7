// Offline draft cache.
//
// When the network is down (or GitHub is rate-limiting us hard), we still
// want the user's edits to survive a tab refresh. We mirror the in-memory
// `drafts` map to an IndexedDB object store keyed by `<shipId>/<filename>`.
//
// On startup the VoyageStoreProvider can re-hydrate any drafts for the
// current ship and re-attempt to save them.
//
// Single object store, single DB. No migrations beyond v1 yet.

const DB_NAME = 'VoyageTrackerV7Drafts';
const DB_VERSION = 1;
const STORE = 'drafts';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === 'undefined') {
    dbPromise = Promise.reject(new Error('IndexedDB not available'));
    return dbPromise;
  }
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode = 'readonly') {
  return openDb().then((db) => {
    const t = db.transaction(STORE, mode);
    return t.objectStore(STORE);
  });
}

const keyOf = (shipId, filename) => `${shipId}/${filename}`;

export async function putDraft(shipId, filename, voyage) {
  const store = await tx('readwrite');
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
  const store = await tx('readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(keyOf(shipId, filename));
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function listDraftsForShip(shipId) {
  const store = await tx();
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
  const store = await tx('readwrite');
  return new Promise((resolve, reject) => {
    const req = store.clear();
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
