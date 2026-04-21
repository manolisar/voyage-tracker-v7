// Storage-adapter contract.
//
// The rest of the app talks ONLY to this interface. The concrete backend is
// the local-filesystem adapter under ./local/ (File System Access API against
// a per-ship network folder — see CLAUDE.md §3).
//
// Adapter shape:
//   {
//     async listVoyages(shipId)
//        -> [{ filename, id, fromPort, toPort, startDate, endDate, ended }]
//           fromPort/toPort are full port objects: { code, name, country, locode }
//     async loadVoyage(shipId, filename)
//        -> { voyage, mtime }          // mtime = File.lastModified, used as
//                                      // the stale-file-check token
//     async saveVoyage(shipId, filename, voyage, prevMtime?)
//        -> { mtime }                  // throws StaleFileError (a subclass
//                                      // of ConflictError) if the on-disk
//                                      // mtime is newer than prevMtime, or
//                                      // if prevMtime is null but the file
//                                      // already exists
//     async deleteVoyage(shipId, filename)
//        -> void
//     async upsertIndex(shipId, filename, manifestEntry)
//        -> void                       // no-op on local; kept on the
//                                      // interface so call-sites don't
//                                      // branch on backend
//   }

let current = null;

export function setStorageAdapter(adapter) {
  current = adapter;
}

export function getStorageAdapter() {
  if (!current) throw new Error('Storage adapter not initialized');
  return current;
}

// Standard error shapes — both adapters throw these so the UI can match on
// `instanceof` regardless of backend.
export class StorageError extends Error {
  constructor(msg, opts = {}) {
    super(msg);
    this.name = 'StorageError';
    this.cause = opts.cause;
    this.status = opts.status;
  }
}

export class ConflictError extends StorageError {
  constructor(msg, opts = {}) {
    super(msg, opts);
    this.name = 'ConflictError';
  }
}

export class NotFoundError extends StorageError {
  constructor(msg, opts = {}) {
    super(msg, opts);
    this.name = 'NotFoundError';
  }
}
