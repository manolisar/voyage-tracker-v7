// Loader for auth.json — the per-ship + admin credentials record.
//
// Resolution order:
//   1. If the storage adapter is the GitHub adapter AND a PAT is available,
//      try to fetch `data/_config/auth.json` from the data repo.
//   2. On NotFound (or any failure), fall back to the in-memory seed config
//      built from the canonical mockup PINs (CLAUDE.md §4).
//
// File shape:
// {
//   "version": 1,
//   "ships": {
//     "solstice":   { "salt": "<b64>", "hash": "<b64>", "iter": 310000 },
//     "equinox":    { ... },
//     ...
//   },
//   "admin": null | { tokenEnvelope: { iter, salt, iv, ct } }
// }

import { hashPin } from './passwords';
import { getStorageAdapter } from '../storage/adapter';

// Seed PINs — canonical mockup values, used as the initial PINs admin will
// rotate after first deploy. Listed in CLAUDE.md §4.
const SEED_PINS = {
  solstice:   '4815',
  equinox:    '2734',
  eclipse:    '7106',
  silhouette: '5293',
  reflection: '8362',
};

let cachedConfig = null;
let cachedSource = null; // 'seed' | 'github'
let cachedSha    = null; // only set when source === 'github'

async function buildSeedConfig() {
  const ships = {};
  for (const [shipId, pin] of Object.entries(SEED_PINS)) {
    ships[shipId] = await hashPin(pin);
  }
  return { version: 1, ships, admin: null };
}

function getGithubAdmin() {
  try {
    const adapter = getStorageAdapter();
    if (adapter?.backend === 'github' && adapter.admin) return adapter.admin;
  } catch { /* adapter not initialized yet */ }
  return null;
}

export async function loadAuthConfig({ force = false } = {}) {
  if (!force && cachedConfig) return cachedConfig;

  const admin = getGithubAdmin();
  if (admin) {
    try {
      const { config, sha } = await admin.loadAuthJson();
      cachedConfig = config;
      cachedSha    = sha;
      cachedSource = 'github';
      return cachedConfig;
    } catch (e) {
      // 404 → fresh repo, fall back to seed and let admin bootstrap.
      // Auth/network errors → also fall back so login can still happen with
      // the seed PINs in dev or as a recovery path.
      console.warn('[authConfig] falling back to seed PINs:', e.message || e);
    }
  }

  cachedConfig = await buildSeedConfig();
  cachedSha    = null;
  cachedSource = 'seed';
  return cachedConfig;
}

export function getAuthSource() { return cachedSource; }
export function getAuthSha()    { return cachedSha; }

export function _resetAuthConfigCache() {
  cachedConfig = null;
  cachedSha    = null;
  cachedSource = null;
}

// Used by AdminPanel / EditModeModal — exported here so consumers don't reach
// into module internals. Returns null if shipId is unknown.
export async function getShipPinRecord(shipId) {
  const cfg = await loadAuthConfig();
  return cfg.ships?.[shipId] || null;
}

/**
 * Persist a mutated config to GitHub (admin only). After success, the cache
 * is updated so subsequent loadAuthConfig() calls return the fresh data.
 *
 * @param {object} nextConfig         — full new auth.json contents
 * @param {string} action             — 'rotate-pin' | 'bootstrap-ship' | 'rotate-token' | 'bootstrap'
 * @returns {Promise<{sha:string}>}
 */
export async function persistAuthConfig(nextConfig, action) {
  const admin = getGithubAdmin();
  if (!admin) throw new Error('Cannot persist auth.json: not connected to GitHub');
  const { sha } = await admin.saveAuthJson(nextConfig, cachedSha, { action });
  cachedConfig = nextConfig;
  cachedSha    = sha;
  cachedSource = 'github';
  return { sha };
}
