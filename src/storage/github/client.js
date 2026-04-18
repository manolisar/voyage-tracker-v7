// Thin fetch wrapper around the GitHub REST API.
//
// Responsibilities:
//   - Inject Authorization + standard headers.
//   - Map HTTP errors to typed StorageError subclasses (so callers don't have
//     to know about HTTP status codes).
//   - Retry transient failures (429 / 5xx / network) with exponential backoff
//     + jitter, honoring `Retry-After` when present.
//
// Non-responsibilities:
//   - Path / payload construction lives in contents.js.
//   - Token storage lives in AuthProvider; we receive a `getToken()` callback.

import {
  ConflictError,
  NotFoundError,
  StorageError,
} from '../adapter';
import { AuthError, NetworkError, RateLimitError } from './errors';

const API_ROOT = 'https://api.github.com';
const DEFAULT_RETRIES = 3;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffDelay(attempt) {
  // exp backoff with full jitter, capped.
  const exp = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
  return Math.floor(Math.random() * exp);
}

function parseRetryAfter(res) {
  const h = res.headers.get('retry-after');
  if (!h) return null;
  const n = parseInt(h, 10);
  return Number.isFinite(n) ? n : null;
}

// GitHub returns 403 with x-ratelimit-remaining: 0 for primary rate limits,
// distinct from 401 auth-failure 403s.
function isRateLimit(res) {
  if (res.status === 429) return true;
  if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') return true;
  return false;
}

async function readBodySafe(res) {
  try {
    const text = await res.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch { return text; }
  } catch { return null; }
}

function mapHttpError(res, body, urlPath) {
  const msg = (body && typeof body === 'object' && body.message) || `HTTP ${res.status} ${urlPath}`;
  const status = res.status;

  if (status === 404) return new NotFoundError(msg, { status });
  if (status === 409 || status === 412) return new ConflictError(msg, { status });
  if (status === 401) return new AuthError(msg, { status });
  if (isRateLimit(res)) {
    return new RateLimitError(msg, { status, retryAfterSeconds: parseRetryAfter(res) });
  }
  if (status === 403) return new AuthError(msg, { status }); // genuine forbidden
  if (status >= 500) return new StorageError(msg, { status });
  return new StorageError(msg, { status });
}

/**
 * Make one authenticated GitHub API call with backoff.
 *
 * @param {string} path   — starts with `/`, e.g. `/repos/owner/repo/contents/...`
 * @param {object} opts
 * @param {'GET'|'PUT'|'DELETE'} [opts.method]
 * @param {object} [opts.body]              — JSON body
 * @param {Record<string,string>} [opts.headers]
 * @param {() => string|null} opts.getToken — pulls the current PAT
 * @param {AbortSignal} [opts.signal]
 * @param {number} [opts.retries]
 * @returns {Promise<{status:number, headers:Headers, data:any}>}
 */
export async function ghFetch(path, {
  method = 'GET',
  body,
  headers = {},
  getToken,
  signal,
  retries = DEFAULT_RETRIES,
} = {}) {
  if (!getToken) throw new Error('ghFetch: getToken callback is required');
  const token = getToken();
  if (!token) throw new AuthError('No GitHub token available');

  const url = `${API_ROOT}${path}`;
  const init = {
    method,
    headers: {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Authorization': `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    signal,
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
    try {
      res = await fetch(url, init);
    } catch (e) {
      // Network failure — retry unless caller bailed.
      if (e?.name === 'AbortError') throw e;
      lastErr = new NetworkError(e.message || 'Network error', { cause: e });
      if (attempt < retries) {
        await sleep(backoffDelay(attempt));
        continue;
      }
      throw lastErr;
    }

    if (res.ok) {
      const data = res.status === 204 ? null : await readBodySafe(res);
      return { status: res.status, headers: res.headers, data };
    }

    const body = await readBodySafe(res);
    const err = mapHttpError(res, body, path);

    // Retryable: rate-limit and 5xx. Conflict / 404 / auth never retried.
    const retryable = err instanceof RateLimitError || (res.status >= 500 && res.status <= 599);
    if (retryable && attempt < retries) {
      const ra = err instanceof RateLimitError ? err.retryAfterSeconds : null;
      const delay = ra ? Math.min(ra * 1000, MAX_BACKOFF_MS) : backoffDelay(attempt);
      await sleep(delay);
      lastErr = err;
      continue;
    }
    throw err;
  }

  // Exhausted retries.
  throw lastErr || new StorageError('Request failed after retries');
}

/**
 * Verify a token works against the data repo. Used by PatEntryModal to give
 * the user immediate feedback when they paste a bad PAT.
 *
 * @returns {Promise<{login:string}>} the GitHub login of the token owner
 */
export async function verifyToken({ getToken }) {
  const { data } = await ghFetch('/user', { getToken, retries: 0 });
  return { login: data?.login || '(unknown)' };
}
