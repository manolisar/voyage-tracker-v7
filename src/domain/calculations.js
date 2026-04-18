// Pure consumption math. Carried over from v6 with one change:
// fuel keys are normalized to lowercase to match storage layer / UI props.

import { defaultDensities } from './shipClass';

// Returns numeric MT (number, not string) or null if inputs incomplete/invalid.
// v6 returned a 2-decimal string; v7 returns the raw number so the caller picks
// formatting. Use formatMT() below for display.
export function calcConsumption(start, end, fuel, densities) {
  if (start === '' || end === '' || start == null || end == null) return null;
  const s = parseFloat(start);
  const e = parseFloat(end);
  if (isNaN(s) || isNaN(e)) return null;
  const diffM3 = e - s;
  if (diffM3 < 0) return null;

  const fuelKey = String(fuel || '').toUpperCase();
  const density = parseFloat(densities?.[fuelKey]);
  if (!density || isNaN(density)) return null;

  return diffM3 * density;
}

// Round MT to 2 decimals for display.
export function formatMT(mt) {
  if (mt == null || isNaN(mt)) return '0.00';
  return Number(mt).toFixed(2);
}

// Sum consumption across an entire voyage, broken down by fuel type.
// Returns { hfo, mgo, lsfo, total } as numbers (MT).
export function calcVoyageTotals(voyage, shipClass) {
  const out = { hfo: 0, mgo: 0, lsfo: 0, total: 0 };
  if (!voyage?.legs) return out;
  const densities = voyage.densities || defaultDensities(shipClass);

  for (const leg of voyage.legs) {
    for (const report of [leg.departure, leg.arrival]) {
      if (!report?.phases) continue;
      for (const phase of report.phases) {
        if (!phase.equipment) continue;
        for (const eq of Object.values(phase.equipment)) {
          const cons = calcConsumption(eq.start, eq.end, eq.fuel, densities);
          if (cons == null) continue;
          const fuelKey = String(eq.fuel || '').toLowerCase();
          if (fuelKey in out) out[fuelKey] += cons;
          out.total += cons;
        }
      }
    }
  }
  return out;
}

// Sum consumption for a single phase, by fuel type.
export function calcPhaseTotals(phase, densities) {
  const out = { hfo: 0, mgo: 0, lsfo: 0, total: 0 };
  if (!phase?.equipment) return out;
  for (const eq of Object.values(phase.equipment)) {
    const cons = calcConsumption(eq.start, eq.end, eq.fuel, densities);
    if (cons == null) continue;
    const fuelKey = String(eq.fuel || '').toLowerCase();
    if (fuelKey in out) out[fuelKey] += cons;
    out.total += cons;
  }
  return out;
}

// File naming for storage: <YYYY-MM-DD>_<route>.json
// Stable: assigned at voyage creation, never regenerated during edits.
export function generateFilename(voyage) {
  if (voyage.filename) return voyage.filename;

  const date = voyage.startDate || new Date().toISOString().split('T')[0];
  const route = (voyage.name && voyage.name.trim())
    ? voyage.name.trim().replace(/[^A-Za-z0-9_-]/g, '_')
    : `voyage_${voyage.id}`;
  return `${date}_${route}.json`;
}

// Build the storage path used by the GitHub layer: data/<shipId>/<filename>
export function voyagePath(voyage) {
  return `data/${voyage.shipId}/${generateFilename(voyage)}`;
}
