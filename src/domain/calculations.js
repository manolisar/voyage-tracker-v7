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

