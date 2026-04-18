#!/usr/bin/env node
// scripts/import-v6.mjs
//
// Migrate v6 JSON voyages into the v7 data repo layout.
//
// v6 shape:  one JSON file per voyage, dropped in a flat user-chosen dir.
// v7 shape:  data/<shipId>/<filename>.json + data/<shipId>/_index.json.
//
// Behavior per voyage:
//   • Add `shipId`, `classId`, `version: 7.0.0`, `lastModified` (now).
//   • Preserve all leg / report / phase data verbatim — equipment keys are
//     identical (dg12 / dg4 / dg3 / boiler1 / boiler2) so no remapping needed.
//   • Default densities are added if missing.
//   • Filename is used as-is (or generated from startDate + name if absent).
//   • _index.json is rebuilt from the imported voyages.
//
// Usage:
//
//   GITHUB_TOKEN=ghp_… GITHUB_REPO=owner/voyage-tracker-data \
//   node scripts/import-v6.mjs \
//        --src ~/Projects/Voyage_Tracker_v6/TestData \
//        --ship solstice \
//        [--class solstice-class] \
//        [--branch main] \
//        [--dry-run]
//
// Defaults: --class solstice-class, --branch main.

import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const argv = parseArgs(process.argv.slice(2));
const SRC      = argv.src;
const SHIP     = argv.ship;
const CLASS    = argv.class  || 'solstice-class';
const BRANCH   = argv.branch || process.env.GITHUB_BRANCH || 'main';
const DRY_RUN  = !!argv['dry-run'];
const TOKEN    = process.env.GITHUB_TOKEN || process.env.VITE_GITHUB_TOKEN;
const REPO     = process.env.GITHUB_REPO  || process.env.VITE_DATA_REPO;

if (!SRC)   die('--src <dir> is required (path to v6 JSON files).');
if (!SHIP)  die('--ship <id> is required (e.g. solstice).');
if (!/^[a-z0-9-]+$/.test(SHIP)) die(`--ship "${SHIP}" must match [a-z0-9-]+`);
if (!DRY_RUN) {
  if (!TOKEN) die('GITHUB_TOKEN env var is required (or use --dry-run).');
  if (!REPO || !REPO.includes('/')) die('GITHUB_REPO must look like "owner/repo".');
}
const [OWNER, REPO_NAME] = (REPO || '/').split('/');

const DEFAULT_DENSITIES = { HFO: 0.92, MGO: 0.83, LSFO: 0.92 };

main().catch((e) => die(e?.message || String(e)));

async function main() {
  console.log(`▶ import-v6 → ${DRY_RUN ? '(dry run)' : `${OWNER}/${REPO_NAME}@${BRANCH}`}  ship=${SHIP}  class=${CLASS}`);

  const files = (await readdir(resolve(SRC)))
    .filter((f) => f.endsWith('.json'))
    .filter((f) => !f.startsWith('_'));

  if (files.length === 0) die(`No .json files in ${SRC}`);

  const indexEntries = [];
  let imported = 0;
  let skipped  = 0;

  for (const file of files) {
    const fullPath = resolve(SRC, file);
    let v6;
    try {
      v6 = JSON.parse(await readFile(fullPath, 'utf8'));
    } catch (e) {
      console.warn(`  ! skip ${file}: invalid JSON (${e.message})`);
      skipped++;
      continue;
    }

    const v7 = transform(v6, file);
    const filename = v7.filename;

    indexEntries.push({
      filename,
      id:        v7.id,
      name:      v7.name,
      startDate: v7.startDate,
      endDate:   v7.endDate || '',
      ended:     !!v7.voyageEnd,
    });

    if (DRY_RUN) {
      console.log(`  ▸ would write data/${SHIP}/${filename}  (legs=${v7.legs?.length ?? 0})`);
    } else {
      await putFile(`data/${SHIP}/${filename}`, v7, `[${SHIP}] import: ${filename}`);
      console.log(`  ✓ wrote data/${SHIP}/${filename}`);
    }
    imported++;
  }

  // Rebuild manifest.
  const indexJson = {
    version: 1,
    voyages: indexEntries.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '')),
  };
  if (DRY_RUN) {
    console.log(`  ▸ would write data/${SHIP}/_index.json  (${indexEntries.length} voyages)`);
  } else {
    await putFile(`data/${SHIP}/_index.json`, indexJson, `[${SHIP}] import: _index.json`);
    console.log(`  ✓ wrote data/${SHIP}/_index.json`);
  }

  console.log(`\nDone. imported=${imported} skipped=${skipped} → data/${SHIP}/`);
}

// ── Transform ─────────────────────────────────────────────────────────────

function transform(v6, originalFilename) {
  const filename = v6.filename || originalFilename;
  return {
    ...v6,
    filename,
    shipId:  SHIP,
    classId: CLASS,
    version: '7.0.0',
    densities: { ...DEFAULT_DENSITIES, ...(v6.densities || {}) },
    voyageEnd: v6.voyageEnd ?? null,
    lastModified: new Date().toISOString(),
  };
}

// ── GitHub helpers ───────────────────────────────────────────────────────

async function putFile(path, jsonObj, message) {
  const sha = await getSha(path);
  const body = {
    message: `${message}\n\nVoyage: ${path.split('/').pop()}\nEditor-Role: Other\nApp-Version: 7.0.0`,
    content: Buffer.from(JSON.stringify(jsonObj, null, 2) + '\n', 'utf8').toString('base64'),
    branch: BRANCH,
    ...(sha ? { sha } : {}),
  };
  await gh(`/repos/${OWNER}/${REPO_NAME}/contents/${encodePath(path)}`, { method: 'PUT', body });
}

async function getSha(path) {
  try {
    const data = await gh(`/repos/${OWNER}/${REPO_NAME}/contents/${encodePath(path)}?ref=${encodeURIComponent(BRANCH)}`);
    return data?.sha || null;
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

function encodePath(p) {
  return p.split('/').map(encodeURIComponent).join('/');
}

async function gh(path, { method = 'GET', body } = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(`GitHub ${res.status}: ${data?.message || text || res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ── Args ─────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
      out[k] = v;
    }
  }
  return out;
}

function die(msg) {
  console.error('✗', msg);
  console.error('  see comments at top of scripts/import-v6.mjs for usage.');
  process.exit(1);
}
