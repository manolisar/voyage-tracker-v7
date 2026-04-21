#!/usr/bin/env node
// scripts/export-from-github.mjs
//
// One-shot migration helper. Pulls every voyage JSON out of the legacy
// voyage-tracker-data GitHub repo and produces per-ship import bundles that
// match the in-app Export format (see src/storage/local/exportImport.js).
//
// Each crew then imports their ship's bundle on first launch via
// Settings → Import, after which the data repo can be archived.
//
// Usage:
//
//   node scripts/export-from-github.mjs [--repo owner/voyage-tracker-data] [--out migration]
//
// Authentication is delegated to the `gh` CLI (no token juggling) — any
// user with read access to the data repo can run this.
//
// Output: migration/voyages-<shipId>-<YYYY-MM-DD>.json, one per ship that
// has at least one voyage. Ships with no data produce no bundle (the crew
// just starts fresh on first launch).

import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const BUNDLE_VERSION = 1;
const APP_VERSION = '7.0.0';

function parseArgs(argv) {
  const args = { repo: 'manolisar/voyage-tracker-data', out: 'migration' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') args.repo = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '-h' || a === '--help') args.help = true;
    else throw new Error(`Unknown arg: ${a}`);
  }
  return args;
}

function gh(apiPath) {
  const res = spawnSync('gh', ['api', apiPath], { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`gh api ${apiPath} failed: ${res.stderr.trim() || res.stdout.trim()}`);
  }
  return JSON.parse(res.stdout);
}

async function loadShips() {
  const raw = await readFile(resolve(ROOT, 'public/ships.json'), 'utf8');
  const parsed = JSON.parse(raw);
  return parsed.ships.filter((s) => s.active);
}

async function listShipFiles(repo, shipId) {
  try {
    const entries = gh(`repos/${repo}/contents/data/${shipId}`);
    return entries
      .filter((e) => e.type === 'file' && e.name.endsWith('.json') && e.name !== '_index.json')
      .map((e) => e.name);
  } catch (e) {
    if (String(e.message).includes('Not Found')) return [];
    throw e;
  }
}

function fetchFile(repo, path) {
  const res = gh(`repos/${repo}/contents/${path}`);
  const buf = Buffer.from(res.content, 'base64');
  return JSON.parse(buf.toString('utf8'));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/export-from-github.mjs [--repo owner/repo] [--out dir]');
    return;
  }

  const ships = await loadShips();
  const outDir = resolve(ROOT, args.out);
  await mkdir(outDir, { recursive: true });

  const exportedAt = new Date().toISOString();
  const date = exportedAt.slice(0, 10);
  const summary = [];

  for (const ship of ships) {
    const filenames = await listShipFiles(args.repo, ship.id);
    if (filenames.length === 0) {
      summary.push({ shipId: ship.id, count: 0, bundle: null });
      console.log(`  ${ship.id.padEnd(12)} — no voyages, skipped`);
      continue;
    }
    filenames.sort();
    const voyages = [];
    for (const filename of filenames) {
      const content = fetchFile(args.repo, `data/${ship.id}/${filename}`);
      voyages.push({ filename, content });
    }
    const bundle = {
      bundleVersion: BUNDLE_VERSION,
      shipId: ship.id,
      exportedAt,
      appVersion: APP_VERSION,
      voyages,
    };
    const outName = `voyages-${ship.id}-${date}.json`;
    const outPath = resolve(outDir, outName);
    await writeFile(outPath, JSON.stringify(bundle, null, 2) + '\n', 'utf8');
    summary.push({ shipId: ship.id, count: voyages.length, bundle: outName });
    console.log(`  ${ship.id.padEnd(12)} — ${voyages.length} voyage(s) → ${outName}`);
  }

  const manifestPath = resolve(outDir, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify({
    exportedAt,
    sourceRepo: args.repo,
    ships: summary,
  }, null, 2) + '\n', 'utf8');
  console.log(`\nWrote manifest → ${args.out}/manifest.json`);
}

main().catch((e) => {
  console.error('export failed:', e.message);
  process.exit(1);
});
