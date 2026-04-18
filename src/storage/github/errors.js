// GitHub-storage-specific error classes.
// Extend the shared StorageError hierarchy from ../adapter.js so the rest of
// the app can stay backend-agnostic and `instanceof` matches across adapters.

import { StorageError } from '../adapter';

// 401 / 403 — token missing, expired, revoked, or lacks scope.
export class AuthError extends StorageError {
  constructor(msg, opts = {}) {
    super(msg, opts);
    this.name = 'AuthError';
  }
}

// 429 or secondary-rate-limit (403 with x-ratelimit-remaining: 0).
// Carries `retryAfterSeconds` if the server gave us one.
export class RateLimitError extends StorageError {
  constructor(msg, opts = {}) {
    super(msg, opts);
    this.name = 'RateLimitError';
    this.retryAfterSeconds = opts.retryAfterSeconds ?? null;
  }
}

// fetch() rejected (DNS, offline, CORS, TLS) — i.e. no HTTP status.
export class NetworkError extends StorageError {
  constructor(msg, opts = {}) {
    super(msg, opts);
    this.name = 'NetworkError';
  }
}

// Path/shipId safety violation. Thrown by contents.js if a caller tries to
// read or write outside `data/<shipId>/`. This is the *client-side* enforcement
// of per-ship isolation (GitHub PATs scope to repo, not path).
export class PathSafetyError extends StorageError {
  constructor(msg, opts = {}) {
    super(msg, opts);
    this.name = 'PathSafetyError';
  }
}
