// Local-file storage adapter (Phase 4).
// Reads voyages from /public/data/<shipId>/ via fetch. WRITE OPERATIONS ARE
// NO-OPS (logged + toast'd) until Phase 3 wires the GitHub adapter.
//
// The on-disk shape mirrors what the data repo will hold:
//   public/data/<shipId>/_index.json     -- voyage manifest
//   public/data/<shipId>/<filename>.json -- one voyage per file

import { NotFoundError, StorageError } from './adapter';

const baseUrl = (() => {
  try { return import.meta.env?.BASE_URL || '/'; } catch { return '/'; }
})();

async function fetchJson(path) {
  const res = await fetch(`${baseUrl}${path}`, { cache: 'no-cache' });
  if (res.status === 404) throw new NotFoundError(`Not found: ${path}`, { status: 404 });
  if (!res.ok) throw new StorageError(`HTTP ${res.status} fetching ${path}`, { status: res.status });
  return res.json();
}

export const localAdapter = {
  async listVoyages(shipId) {
    try {
      const idx = await fetchJson(`data/${shipId}/_index.json`);
      const list = Array.isArray(idx?.voyages) ? idx.voyages : [];
      // Defensive copy + stable sort by startDate desc.
      return [...list].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
    } catch (e) {
      if (e instanceof NotFoundError) return [];
      throw e;
    }
  },

  async loadVoyage(shipId, filename) {
    const voyage = await fetchJson(`data/${shipId}/${filename}`);
    return { voyage, sha: null };
  },

  async saveVoyage(shipId, filename, voyage, prevSha) {
    console.warn('[localAdapter] saveVoyage is a no-op until Phase 3 (GitHub) is wired.', {
      shipId, filename, sizeBytes: JSON.stringify(voyage || {}).length, hasPrevSha: !!prevSha,
    });
    return { sha: null };
  },

  async deleteVoyage(shipId, filename, prevSha) {
    console.warn('[localAdapter] deleteVoyage is a no-op until Phase 3 (GitHub) is wired.', {
      shipId, filename, hasPrevSha: !!prevSha,
    });
  },

  // _index.json maintenance has no meaning against /public/data/ (static).
  async upsertIndex() { /* no-op */ },
};
