// Export / import voyage bundles.
//
// A bundle is a JSON file containing every voyage for a single ship. We use it
// for two things:
//   1. Ad-hoc backup / hand-off (Settings → Export).
//   2. One-shot migration from the old GitHub data repo (Settings → Import).
//
// Bundle shape (kept intentionally flat):
//
// {
//   "bundleVersion": 1,
//   "shipId":        "solstice",
//   "exportedAt":    "2026-04-19T12:34:56Z",
//   "appVersion":    "7.0.0",
//   "voyages": [
//     { "filename": "2026-01-15_MIA-NAS-MIA.json", "content": { ...voyage JSON... } },
//     ...
//   ]
// }
//
// Import behaviour is append-only: files whose names already exist in the
// target folder are skipped (listed in the return summary). This keeps v1
// simple; conflict-on-import can be added later if it turns out to be
// needed, but typical usage is importing into an empty folder.

import { getHandleForShip } from './fsHandle';
import { PathSafetyError } from './errors';

const BUNDLE_VERSION = 1;
const APP_VERSION = '7.0.0';
const FILENAME_RE = /^[A-Za-z0-9._-]+$/;

function ensureSafeFilename(filename) {
  if (!filename || typeof filename !== 'string' || !FILENAME_RE.test(filename) || filename.includes('..')) {
    throw new PathSafetyError(`Invalid filename in bundle: ${JSON.stringify(filename)}`);
  }
}

/**
 * Read every `.json` file in the ship's folder and pack it into a single
 * bundle object. Returns the bundle (caller decides how to deliver it —
 * typically via `downloadBundle`).
 */
export async function buildBundle(shipId) {
  const dir = await getHandleForShip(shipId);
  const voyages = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== 'file') continue;
    if (!name.endsWith('.json')) continue;
    if (name === '_index.json') continue;
    const file = await handle.getFile();
    const text = await file.text();
    let content;
    try { content = JSON.parse(text); }
    catch (e) {
      throw new Error(`Corrupt JSON in ${name}: ${e.message}`);
    }
    voyages.push({ filename: name, content });
  }
  voyages.sort((a, b) => a.filename.localeCompare(b.filename));
  return {
    bundleVersion: BUNDLE_VERSION,
    shipId,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    voyages,
  };
}

/**
 * Trigger a browser download of the bundle as `voyages-<shipId>-<date>.json`.
 * Uses a throwaway anchor + object URL — no external dependency.
 */
export function downloadBundle(bundle) {
  const date = bundle.exportedAt.slice(0, 10);
  const filename = `voyages-${bundle.shipId}-${date}.json`;
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return filename;
}

/**
 * Parse a user-provided bundle File (from `<input type="file">`) and validate
 * its shape. Returns the bundle object. Throws with a useful message if the
 * file isn't a valid bundle.
 */
export async function parseBundleFile(file) {
  const text = await file.text();
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (e) { throw new Error(`Not valid JSON: ${e.message}`); }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Bundle root must be an object');
  }
  if (parsed.bundleVersion !== BUNDLE_VERSION) {
    throw new Error(`Unsupported bundleVersion ${parsed.bundleVersion} (expected ${BUNDLE_VERSION})`);
  }
  if (typeof parsed.shipId !== 'string' || !parsed.shipId) {
    throw new Error('Bundle is missing shipId');
  }
  if (!Array.isArray(parsed.voyages)) {
    throw new Error('Bundle.voyages must be an array');
  }
  for (const v of parsed.voyages) {
    if (!v || typeof v !== 'object') throw new Error('Each voyage entry must be an object');
    ensureSafeFilename(v.filename);
    if (!v.content || typeof v.content !== 'object') {
      throw new Error(`Voyage ${v.filename} is missing a content object`);
    }
  }
  return parsed;
}

/**
 * Write each voyage in the bundle into the ship's folder. Files that already
 * exist on disk are SKIPPED (not overwritten). Returns:
 *
 *   { written: [filenames], skipped: [filenames] }
 *
 * If `bundle.shipId` doesn't match `targetShipId`, the caller is warned via
 * the `shipMismatch` flag — but import still proceeds if the caller accepts
 * it (see SettingsPanel). The ship id inside the bundle is advisory; the
 * directory handle determines where files land.
 */
export async function importBundle(bundle, targetShipId) {
  const dir = await getHandleForShip(targetShipId);

  // Build a set of existing filenames to check against.
  const existing = new Set();
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'file' && name.endsWith('.json')) existing.add(name);
  }

  const written = [];
  const skipped = [];
  for (const v of bundle.voyages) {
    if (existing.has(v.filename)) {
      skipped.push(v.filename);
      continue;
    }
    const fh = await dir.getFileHandle(v.filename, { create: true });
    const writable = await fh.createWritable();
    try {
      await writable.write(JSON.stringify(v.content, null, 2) + '\n');
    } finally {
      await writable.close();
    }
    written.push(v.filename);
  }
  return { written, skipped };
}
