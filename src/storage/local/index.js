// Local-filesystem storage adapter — implements the contract in ../adapter.js
// against a per-ship network folder picked via the File System Access API.
//
// Construction:
//
//   const adapter = createLocalAdapter({
//     getSession: () => session,   // { userName, role } — stamped on each save
//   });
//   setStorageAdapter(adapter);
//
// `getSession` is an accessor (not a value) so the adapter always sees the
// freshest session without needing to be rebuilt when the user changes.
//
// Stale-file detection uses `file.lastModified` (mtime) rather than a hash:
// `saveVoyage(shipId, filename, voyage, prevMtime?)` throws `StaleFileError`
// if the on-disk mtime is newer than the `prevMtime` the caller remembered at
// load time. Return shape is `{ mtime }`.

import {
  listVoyages,
  loadVoyage,
  saveVoyage,
  deleteVoyage,
  upsertShipIndex,
} from './voyages';

export function createLocalAdapter({ getSession = () => null } = {}) {
  return {
    backend: 'local',

    listVoyages: (shipId) => listVoyages(shipId),

    loadVoyage: (shipId, filename) => loadVoyage(shipId, filename),

    // Inject `loggedBy` stamp before writing. The storage layer owns this so
    // callers don't have to remember. See CLAUDE.md §3 for the shape.
    saveVoyage: (shipId, filename, voyage, prevMtime) => {
      const stamped = stampLoggedBy(voyage, getSession());
      return saveVoyage(shipId, filename, stamped, prevMtime);
    },

    deleteVoyage: (shipId, filename /*, prevMtime */) =>
      deleteVoyage(shipId, filename),

    // No-op on local (see voyages.js). Kept so VoyageStoreProvider call-sites
    // don't need to branch on backend.
    upsertIndex: (shipId, filename, entry) =>
      upsertShipIndex(shipId, filename, entry),
  };
}

function stampLoggedBy(voyage, session) {
  if (!voyage || typeof voyage !== 'object') return voyage;
  if (!session || !session.userName) return voyage;
  return {
    ...voyage,
    loggedBy: {
      name: String(session.userName),
      role: session.role ?? null,
      at: new Date().toISOString(),
    },
  };
}

export * from './errors';
export {
  pickDirectoryForShip,
  getHandleForShip,
  hasHandleForShip,
  hasGrantedHandleForShip,
  clearHandleForShip,
  isFileSystemAccessSupported,
} from './fsHandle';
