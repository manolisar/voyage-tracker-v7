// Read / write `data/_config/auth.json` in the data repo.
//
// This is the ONE legitimate path that lives outside `data/<shipId>/` —
// it holds per-ship PIN hashes (and optionally a shared admin token
// envelope) and is admin-only. We keep these helpers in their own module
// so contents.js can keep its strict per-ship path-safety invariant.
//
// File shape (mirrors src/auth/authConfig.js):
//   {
//     "version": 1,
//     "ships": {
//       "solstice":   { salt, hash, iter },
//       "equinox":    { ... },
//       ...
//     },
//     "admin": null | { tokenEnvelope: { iter, salt, iv, ct } }
//   }

import { ghFetch } from './client';
import { NotFoundError } from '../adapter';
import { formatCommitMessage } from './commits';

const AUTH_PATH = 'data/_config/auth.json';

function authUrl(ctx) {
  const ref = ctx.branch ? `?ref=${encodeURIComponent(ctx.branch)}` : '';
  return `/repos/${ctx.owner}/${ctx.repo}/contents/${AUTH_PATH}${ref}`;
}

function b64encodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64decodeUtf8(b64) {
  const clean = (b64 || '').replace(/\s+/g, '');
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/**
 * Load auth.json. Returns `{ config, sha }` — sha is needed for the next save.
 * Throws NotFoundError if the file doesn't exist yet (admin should bootstrap).
 */
export async function loadAuthJson(ctx) {
  const { data } = await ghFetch(authUrl(ctx), { getToken: ctx.getToken });
  if (!data || data.type !== 'file' || typeof data.content !== 'string') {
    throw new NotFoundError('auth.json not found');
  }
  const text = b64decodeUtf8(data.content);
  let config;
  try { config = JSON.parse(text); }
  catch (e) { throw new Error(`auth.json is invalid JSON: ${e.message}`); }
  return { config, sha: data.sha };
}

/**
 * Save auth.json. Pass `prevSha` for optimistic concurrency (received from
 * loadAuthJson). Pass null only when bootstrapping a fresh file.
 *
 * @param {string} action  — one of 'rotate-pin' | 'bootstrap-ship' | 'rotate-token' | 'bootstrap'
 */
export async function saveAuthJson(ctx, config, prevSha, { action = 'update', editorRole = null } = {}) {
  const message = formatCommitMessage({
    action,
    shipId: '_config',
    filename: 'auth.json',
    voyage: null,
    editorRole,
  });
  const body = {
    message,
    content: b64encodeUtf8(JSON.stringify(config, null, 2) + '\n'),
    ...(ctx.branch ? { branch: ctx.branch } : {}),
    ...(prevSha ? { sha: prevSha } : {}),
  };
  const { data } = await ghFetch(`/repos/${ctx.owner}/${ctx.repo}/contents/${AUTH_PATH}`, {
    method: 'PUT',
    body,
    getToken: ctx.getToken,
  });
  return { sha: data?.content?.sha || null };
}

/**
 * Bootstrap a brand-new ship by writing an empty `data/<shipId>/_index.json`.
 * Does NOT touch auth.json — caller does that with saveAuthJson() if a PIN
 * record is needed too.
 */
export async function bootstrapShipIndex(ctx, shipId, { editorRole = null } = {}) {
  const path = `data/${shipId}/_index.json`;
  const message = formatCommitMessage({
    action: 'bootstrap-ship',
    shipId,
    filename: '_index.json',
    voyage: null,
    editorRole,
  });
  const body = {
    message,
    content: b64encodeUtf8(JSON.stringify({ version: 1, voyages: [] }, null, 2) + '\n'),
    ...(ctx.branch ? { branch: ctx.branch } : {}),
  };
  await ghFetch(`/repos/${ctx.owner}/${ctx.repo}/contents/${path}`, {
    method: 'PUT',
    body,
    getToken: ctx.getToken,
  });
}
