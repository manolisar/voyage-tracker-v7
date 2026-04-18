// CRUD operations against the GitHub Contents API.
// Layout in the data repo (CLAUDE.md §3):
//
//   data/_config/auth.json
//   data/<shipId>/_index.json
//   data/<shipId>/<filename>.json
//
// Path-safety: every read/write is forced under `data/<shipId>/`. We will
// throw PathSafetyError before issuing a request that would touch any other
// path. (GitHub PATs scope to repo, not path — this is the client-side
// enforcement of per-ship isolation.)

import { NotFoundError } from '../adapter';
import { ghFetch } from './client';
import { formatCommitMessage } from './commits';
import { PathSafetyError } from './errors';

// ── Base64 helpers (UTF-8 safe) ──────────────────────────────────────────
function b64encodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64decodeUtf8(b64) {
  // GitHub returns base64 with embedded newlines.
  const clean = (b64 || '').replace(/\s+/g, '');
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ── Path safety ──────────────────────────────────────────────────────────
const FILENAME_RE = /^[A-Za-z0-9._-]+$/;
const SHIPID_RE   = /^[a-z0-9-]+$/;

function ensureSafeShip(shipId) {
  if (!shipId || !SHIPID_RE.test(shipId)) {
    throw new PathSafetyError(`Invalid shipId: ${JSON.stringify(shipId)}`);
  }
}
function ensureSafeFilename(filename) {
  if (!filename || !FILENAME_RE.test(filename) || filename.includes('..')) {
    throw new PathSafetyError(`Invalid filename: ${JSON.stringify(filename)}`);
  }
}

function shipDataPath(shipId, filename = '') {
  ensureSafeShip(shipId);
  if (filename) ensureSafeFilename(filename);
  return filename ? `data/${shipId}/${filename}` : `data/${shipId}`;
}

// ── Ctx ──────────────────────────────────────────────────────────────────
// All exported funcs take a `ctx` carrying repo coordinates + token getter.
//   { owner, repo, branch, getToken }

function contentsUrl(ctx, path) {
  const enc = path.split('/').map(encodeURIComponent).join('/');
  const ref = ctx.branch ? `?ref=${encodeURIComponent(ctx.branch)}` : '';
  return `/repos/${ctx.owner}/${ctx.repo}/contents/${enc}${ref}`;
}

// ── Operations ───────────────────────────────────────────────────────────

/**
 * List voyages for a ship.
 *
 * Strategy: read `data/<shipId>/_index.json`. If absent, fall back to listing
 * the directory and synthesizing a thin manifest.
 */
export async function listVoyages(ctx, shipId) {
  ensureSafeShip(shipId);
  // Primary: index file.
  try {
    const { voyage: idx } = await loadJson(ctx, shipDataPath(shipId, '_index.json'));
    const list = Array.isArray(idx?.voyages) ? idx.voyages : [];
    return [...list].sort((a, b) =>
      (b.startDate || '').localeCompare(a.startDate || ''),
    );
  } catch (e) {
    if (!(e instanceof NotFoundError)) throw e;
  }

  // Fallback: directory listing → synthesize bare entries.
  try {
    const { data } = await ghFetch(contentsUrl(ctx, shipDataPath(shipId)), { getToken: ctx.getToken });
    if (!Array.isArray(data)) return [];
    return data
      .filter((it) => it.type === 'file' && it.name.endsWith('.json') && it.name !== '_index.json')
      .map((it) => ({ filename: it.name, name: it.name, startDate: '', endDate: '', ended: false }))
      .sort((a, b) => b.filename.localeCompare(a.filename));
  } catch (e) {
    if (e instanceof NotFoundError) return [];
    throw e;
  }
}

/**
 * Load a single voyage.
 * @returns {Promise<{voyage:object, sha:string}>}
 */
export async function loadVoyage(ctx, shipId, filename) {
  return loadJson(ctx, shipDataPath(shipId, filename));
}

async function loadJson(ctx, path) {
  const { data } = await ghFetch(contentsUrl(ctx, path), { getToken: ctx.getToken });
  if (!data || data.type !== 'file' || typeof data.content !== 'string') {
    throw new NotFoundError(`Not a file: ${path}`);
  }
  const text = b64decodeUtf8(data.content);
  let voyage;
  try { voyage = JSON.parse(text); }
  catch (e) { throw new Error(`Invalid JSON in ${path}: ${e.message}`); }
  return { voyage, sha: data.sha };
}

/**
 * Save (create or update) a voyage.
 *
 * @param {object} ctx
 * @param {string} shipId
 * @param {string} filename
 * @param {object} voyage
 * @param {string|null} prevSha     — if known, sent for optimistic concurrency
 * @param {object} [meta]
 * @param {string} [meta.editorRole]
 * @returns {Promise<{sha:string}>}
 */
export async function saveVoyage(ctx, shipId, filename, voyage, prevSha, meta = {}) {
  const path = shipDataPath(shipId, filename);
  const message = formatCommitMessage({
    action: prevSha ? 'save' : 'create',
    shipId,
    filename,
    voyage,
    editorRole: meta.editorRole || null,
  });
  const body = {
    message,
    content: b64encodeUtf8(JSON.stringify(voyage, null, 2) + '\n'),
    ...(ctx.branch ? { branch: ctx.branch } : {}),
    ...(prevSha ? { sha: prevSha } : {}),
  };
  const { data } = await ghFetch(`/repos/${ctx.owner}/${ctx.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'PUT',
    body,
    getToken: ctx.getToken,
  });
  return { sha: data?.content?.sha || null };
}

/**
 * Delete a voyage. Requires the prior SHA per Contents API.
 */
export async function deleteVoyage(ctx, shipId, filename, prevSha, meta = {}) {
  if (!prevSha) {
    // Fetch sha first.
    const { sha } = await loadVoyage(ctx, shipId, filename);
    prevSha = sha;
  }
  const path = shipDataPath(shipId, filename);
  const message = formatCommitMessage({
    action: 'delete',
    shipId,
    filename,
    voyage: null,
    editorRole: meta.editorRole || null,
  });
  await ghFetch(`/repos/${ctx.owner}/${ctx.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'DELETE',
    body: {
      message,
      sha: prevSha,
      ...(ctx.branch ? { branch: ctx.branch } : {}),
    },
    getToken: ctx.getToken,
  });
}
