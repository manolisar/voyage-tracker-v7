// CRUD against a per-ship network folder via the File System Access API.
// Implements the storage adapter contract defined in ../adapter.js so the
// rest of the app depends on the interface, not the backend.
//
// Concurrency semantics: mtime-based stale-file check on saveVoyage. The
// caller passes the mtime it remembered at load time; if the on-disk mtime
// is newer we throw StaleFileError for the UI to resolve. See CLAUDE.md
// §3 ("Stale-file check") for the rationale.

import { NotFoundError } from '../adapter';
import { getHandleForShip } from './fsHandle';
import { PathSafetyError, StaleFileError } from './errors';

// ── Filename safety ──────────────────────────────────────────────────────
// We no longer enforce a per-ship path prefix — the directory handle IS the
// scope boundary — but filename validation still matters because these
// strings become actual filenames on the ship's share.

const FILENAME_RE = /^[A-Za-z0-9._-]+$/;

function ensureSafeFilename(filename) {
  if (!filename || !FILENAME_RE.test(filename) || filename.includes('..')) {
    throw new PathSafetyError(`Invalid filename: ${JSON.stringify(filename)}`);
  }
}

// ── Small helpers ────────────────────────────────────────────────────────

async function tryGetFileHandle(dirHandle, filename, { create = false } = {}) {
  try {
    return await dirHandle.getFileHandle(filename, { create });
  } catch (e) {
    if (e.name === 'NotFoundError') return null;
    throw e;
  }
}

async function readJson(fileHandle) {
  const file = await fileHandle.getFile();
  const text = await file.text();
  let voyage;
  try { voyage = JSON.parse(text); }
  catch (e) { throw new Error(`Invalid JSON in ${fileHandle.name}: ${e.message}`); }
  return { voyage, mtime: file.lastModified };
}

async function writeJson(fileHandle, obj) {
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(JSON.stringify(obj, null, 2) + '\n');
  } finally {
    // Always close — `createWritable` holds an exclusive lock on the file
    // until we do, and Chromium atomically swaps in the temp content on
    // close. If we throw before close, the file on disk is untouched.
    await writable.close();
  }
  // After close, get the new mtime so callers can track it for the next
  // stale-file check.
  const f = await fileHandle.getFile();
  return { mtime: f.lastModified };
}

// ── Operations ───────────────────────────────────────────────────────────

/**
 * List all voyages in this ship's folder.
 *
 * Unlike the github adapter we do NOT consult an `_index.json` — directory
 * listing via the FSA API is cheap on a LAN share and avoids the stale-
 * index problem entirely. We still synthesize a manifest with startDate /
 * ended derived from each file's contents.
 */
export async function listVoyages(shipId) {
  const dir = await getHandleForShip(shipId);
  const entries = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== 'file') continue;
    if (!name.endsWith('.json')) continue;
    if (name === '_index.json') continue;
    entries.push({ name, handle });
  }

  const emptyPort = { code: '', name: '', country: '', locode: '' };
  const manifest = [];
  for (const { name, handle } of entries) {
    try {
      const { voyage } = await readJson(handle);
      manifest.push({
        filename: name,
        id: voyage?.id ?? name,
        fromPort: voyage?.fromPort ?? emptyPort,
        toPort:   voyage?.toPort   ?? emptyPort,
        startDate: voyage?.startDate ?? '',
        endDate: voyage?.endDate ?? '',
        ended: !!voyage?.voyageEnd,
      });
    } catch (e) {
      // A single corrupt file shouldn't kill the manifest. Surface it with
      // a placeholder entry so the tree can still list it; load-time errors
      // will re-surface when the user tries to open it.
      console.warn(`[local/voyages] Failed to parse ${name}:`, e);
      manifest.push({
        filename: name, id: name,
        fromPort: emptyPort, toPort: emptyPort,
        startDate: '', endDate: '', ended: false,
      });
    }
  }

  manifest.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
  return manifest;
}

/**
 * Load a voyage. Returns `{ voyage, mtime }` — `mtime` is the number of ms
 * since epoch as reported by `File.lastModified`, used by the caller for
 * the stale-file check on the next save.
 */
export async function loadVoyage(shipId, filename) {
  ensureSafeFilename(filename);
  const dir = await getHandleForShip(shipId);
  const fh = await tryGetFileHandle(dir, filename);
  if (!fh) throw new NotFoundError(`Not found: ${filename}`);
  return readJson(fh);
}

/**
 * Save (create or overwrite) a voyage.
 *
 * If `prevMtime` is non-null and the file already exists, we re-check the
 * on-disk `lastModified` and throw StaleFileError if it's newer — the UI
 * then offers the user Reload / Overwrite / Cancel.
 *
 * When throwing StaleFileError we include the current on-disk voyage and
 * mtime so the UI can show what changed without a second round-trip.
 *
 * Returns `{ mtime }` of the just-written file.
 */
export async function saveVoyage(shipId, filename, voyage, prevMtime = null) {
  ensureSafeFilename(filename);
  const dir = await getHandleForShip(shipId);

  const existing = await tryGetFileHandle(dir, filename);
  if (existing) {
    const f = await existing.getFile();
    if (prevMtime == null) {
      // Caller thinks this is a brand-new file, but a file with this name is
      // already on disk — refuse to silently clobber it. Surface as a stale-
      // file conflict so the UI can offer Reload / Overwrite / Cancel.
      let currentVoyage = null;
      try { currentVoyage = JSON.parse(await f.text()); } catch { /* ignore parse */ }
      throw new StaleFileError(
        `File already exists: ${filename}`,
        {
          loadedMtime: null,
          currentMtime: f.lastModified,
          currentVoyage,
        },
      );
    }
    if (f.lastModified > prevMtime) {
      let currentVoyage = null;
      try { currentVoyage = JSON.parse(await f.text()); } catch { /* ignore parse */ }
      throw new StaleFileError(
        `File changed on disk since load: ${filename}`,
        {
          loadedMtime: prevMtime,
          currentMtime: f.lastModified,
          currentVoyage,
        },
      );
    }
  }

  const fh = existing || await dir.getFileHandle(filename, { create: true });
  return writeJson(fh, voyage);
}

/**
 * Delete a voyage file. No stale-check — delete is destructive by intent.
 */
export async function deleteVoyage(shipId, filename) {
  ensureSafeFilename(filename);
  const dir = await getHandleForShip(shipId);
  try {
    await dir.removeEntry(filename);
  } catch (e) {
    if (e.name === 'NotFoundError') throw new NotFoundError(`Not found: ${filename}`);
    throw e;
  }
}

/**
 * upsertIndex is a no-op on the local adapter.
 *
 * The github adapter wrote `_index.json` because listing a repo directory
 * via the Contents API is slow; on a local/SMB share `dir.entries()` is
 * fast enough that we always re-scan instead. Keeping the export so call-
 * sites in VoyageStoreProvider don't need to branch on backend.
 */
// eslint-disable-next-line no-unused-vars
export async function upsertShipIndex(_shipId, _filename, _entry) {
  /* no-op */
}
