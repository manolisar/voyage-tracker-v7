// Ship class loader + helpers.
// Replaces v6's hardcoded equipment keys (dg12 / dg4 / dg3 / boiler1 / boiler2).
// Ship-class JSON files live in public/ship-classes/<classId>.json and drive
// equipment lists, allowed fuels, default densities, and phase templates.

const cache = new Map();
const inflight = new Map();

const baseUrl = (() => {
  // Vite injects import.meta.env.BASE_URL; falls back to '/' under tests.
  try {
    return import.meta.env?.BASE_URL || '/';
  } catch {
    return '/';
  }
})();

export async function loadShips() {
  if (cache.has('__ships')) return cache.get('__ships');
  const res = await fetch(`${baseUrl}ships.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load ships.json (${res.status})`);
  const data = await res.json();
  cache.set('__ships', data);
  return data;
}

export async function loadShipClass(classId) {
  if (cache.has(classId)) return cache.get(classId);
  if (inflight.has(classId)) return inflight.get(classId);

  const p = (async () => {
    const res = await fetch(`${baseUrl}ship-classes/${classId}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to load ship-class ${classId} (${res.status})`);
    const data = await res.json();
    cache.set(classId, data);
    return data;
  })();
  inflight.set(classId, p);
  try {
    return await p;
  } finally {
    inflight.delete(classId);
  }
}

// --- pure helpers (sync, take a loaded shipClass object) ---

export function equipmentKeys(shipClass) {
  return shipClass.equipment.map((e) => e.key);
}

export function equipmentLabel(shipClass, key) {
  return shipClass.equipment.find((e) => e.key === key)?.label ?? key;
}

export function equipmentDef(shipClass, key) {
  return shipClass.equipment.find((e) => e.key === key) ?? null;
}

export function defaultDensities(shipClass) {
  return { ...shipClass.defaultDensities };
}

export function fuelOptions(shipClass) {
  return [...shipClass.fuels];
}

// Reset cache — used by tests or when admin reloads class config.
export function _clearShipClassCache() {
  cache.clear();
  inflight.clear();
}
