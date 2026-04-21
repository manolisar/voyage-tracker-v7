// Voyage data validation + auto-fix on load.
// Carried from v6's validateCruiseData; extended for v7 multi-ship + classId.

import { APP_VERSION } from './constants';
import { defaultDensities } from './shipClass';

// Returns { valid, errors, data } where `data` is a normalized copy with
// missing fields backfilled. Never throws.
export function validateVoyageData(data, { shipClass, expectedShipId } = {}) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Invalid data format'], data: null };
  }

  if (!data.id) errors.push('Missing voyage id');
  if (!Array.isArray(data.legs)) errors.push('Invalid legs array');
  if (data.shipId == null) errors.push('Missing shipId');
  if (expectedShipId && data.shipId && data.shipId !== expectedShipId) {
    errors.push(`shipId mismatch: file=${data.shipId} expected=${expectedShipId}`);
  }

  if (data.densities) {
    for (const [fuel, density] of Object.entries(data.densities)) {
      const d = parseFloat(density);
      if (isNaN(d) || d <= 0 || d > 2) {
        errors.push(`Invalid ${fuel} density: ${density}`);
      }
    }
  }

  const fallbackDensities = shipClass ? defaultDensities(shipClass) : { HFO: 0.92, MGO: 0.83, LSFO: 0.92 };

  const emptyPort = { code: '', name: '', country: '', locode: '' };
  const fixed = {
    id: data.id || Date.now(),
    shipId: data.shipId || expectedShipId || null,
    classId: data.classId || shipClass?.id || null,
    fromPort: data.fromPort || emptyPort,
    toPort:   data.toPort   || emptyPort,
    startDate: data.startDate || '',
    endDate: data.endDate || '',
    legs: Array.isArray(data.legs)
      ? data.legs.map((leg) => ({
          ...leg,
          voyageReport: leg.voyageReport || null,
        }))
      : [],
    densities: { ...fallbackDensities, ...(data.densities || {}) },
    voyageEnd: data.voyageEnd || null,
    lastModified: data.lastModified || new Date().toISOString(),
    version: APP_VERSION,
    filename: data.filename || null,
  };

  return { valid: errors.length === 0, errors, data: fixed };
}

// Lightweight ship-id sanity check used by the storage layer to refuse cross-
// ship writes. ALWAYS check this before PUTing — never trust caller.
export function isShipPath(path, shipId) {
  return typeof path === 'string'
      && typeof shipId === 'string'
      && path.startsWith(`data/${shipId}/`);
}
