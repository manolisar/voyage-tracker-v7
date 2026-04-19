// Local-filesystem storage adapter — implements the same shape as the
// github adapter (see ../adapter.js for the contract + ../github/index.js
// for the reference implementation we're replacing).
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
// Differences from the github adapter (by design):
//   - `saveVoyage(shipId, filename, voyage, prevMtime?)` uses an mtime instead
//     of a SHA for stale-file detection. The caller tracks what mtime it saw
//     at load time and passes it back on save.
//   - Return shape is `{ mtime }` instead of `{ sha }`.
//   - No `admin` sub-object — there are no admin-only ops on local storage.
//     Settings panel calls fsHandle + exportImport directly.

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
