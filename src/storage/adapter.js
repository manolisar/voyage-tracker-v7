// Storage-adapter contract.
//
// Phase 4 wires a local-file adapter (fetches /data/<shipId>/...).
// Phase 3 (next) will replace it with a GitHub Contents API adapter that
// implements the same shape. The rest of the app talks ONLY to this interface.
//
// Adapter shape:
//   {
//     async listVoyages(shipId)
//        -> [{ filename, id, name, startDate, endDate, ended }]
//     async loadVoyage(shipId, filename)
//        -> { voyage, sha?: string }   // sha = optimistic-concurrency token
//     async saveVoyage(shipId, filename, voyage, prevSha?)
//        -> { sha }                    // throws ConflictError on 409
//     async deleteVoyage(shipId, filename, prevSha?)
//        -> void
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
