#!/usr/bin/env node
// scripts/seed-auth.mjs
//
// One-off bootstrap: write data/_config/auth.json into the data repo with the
// canonical seed PINs from CLAUDE.md §4.
//
// Usage:
//
//   GITHUB_TOKEN=ghp_… \
//   GITHUB_REPO=owner/voyage-tracker-data \
//   GITHUB_BRANCH=main \
//   node scripts/seed-auth.mjs
//
// Safe-by-default: refuses to overwrite an existing auth.json unless --force.
//
// Equivalent to clicking "Seed PIN" for every ship from the Admin Panel, but
// without needing the running app — useful for first deploy.

import { webcrypto as nodeCrypto } from 'node:crypto';

const SEED_PINS = {
  solstice:   '4815',
  equinox:    '2734',
  eclipse:    '7106',
  silhouette: '5293',
  reflection: '8362',
};

const PBKDF2_ITER  = 310_000;
const HASH_BYTES   = 32;
const SALT_BYTES   = 16;
const AUTH_PATH    = 'data/_config/auth.json';

const TOKEN  = process.env.GITHUB_TOKEN  || process.env.VITE_GITHUB_TOKEN;
const REPO   = process.env.GITHUB_REPO   || process.env.VITE_DATA_REPO;
const BRANCH = process.env.GITHUB_BRANCH || process.env.VITE_DATA_BRANCH || 'main';
const FORCE  = process.argv.includes('--force');

if (!TOKEN) die('GITHUB_TOKEN env var is required.');
if (!REPO || !REPO.includes('/')) die('GITHUB_REPO must look like "owner/repo".');

const [OWNER, REPO_NAME] = REPO.split('/');

main().catch((e) => die(e?.message || String(e)));

async function main() {
  console.log(`▶ seed-auth → ${OWNER}/${REPO_NAME}@${BRANCH} (${AUTH_PATH})`);

  // 1. Build hash records.
  const ships = {};
  for (const [shipId, pin] of Object.entries(SEED_PINS)) {
    ships[shipId] = await hashPin(pin);
    console.log(`  ✓ hashed PIN for ${shipId}`);
  }
  const config = { version: 1, ships, admin: null };

  // 2. Check if file exists.
  const existing = await getAuthSha();
  if (existing && !FORCE) {
    die('auth.json already exists. Re-run with --force to overwrite (this rotates ALL ship PINs).');
  }

  // 3. Write.
  const message = `[_config] ${existing ? 'rotate' : 'bootstrap'}: auth.json\n\n` +
                  `Voyage: seed-auth.mjs\n` +
                  `Editor-Role: Other\n` +
                  `App-Version: 7.0.0`;
  const body = {
    message,
    content: Buffer.from(JSON.stringify(config, null, 2) + '\n', 'utf8').toString('base64'),
    branch: BRANCH,
    ...(existing ? { sha: existing } : {}),
  };
  const res = await gh(`/repos/${OWNER}/${REPO_NAME}/contents/${AUTH_PATH}`, {
    method: 'PUT',
    body,
  });

  console.log(`✓ wrote auth.json — sha ${res?.content?.sha?.slice(0, 7) || '?'}`);
  console.log('Done. Seeded PINs:');
  for (const [s, p] of Object.entries(SEED_PINS)) console.log(`    ${s.padEnd(11)} ${p}`);
  console.log('Rotate them via the Admin Panel after first login.');
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function hashPin(pin) {
  const enc = new TextEncoder();
  const salt = nodeCrypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const km = await nodeCrypto.subtle.importKey(
    'raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits'],
  );
  const buf = await nodeCrypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
    km, HASH_BYTES * 8,
  );
  return {
    salt: Buffer.from(salt).toString('base64'),
    hash: Buffer.from(buf).toString('base64'),
    iter: PBKDF2_ITER,
  };
}

async function getAuthSha() {
  try {
    const data = await gh(`/repos/${OWNER}/${REPO_NAME}/contents/${AUTH_PATH}?ref=${encodeURIComponent(BRANCH)}`);
    return data?.sha || null;
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
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

function die(msg) {
  console.error('✗', msg);
  process.exit(1);
}
