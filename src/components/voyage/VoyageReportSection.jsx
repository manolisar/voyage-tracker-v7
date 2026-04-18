// VoyageReportSection — Bridge / navigation data per leg.
// 3 columns: Departure / Sea Passage / Arrival. Avg speed auto-derived.
// v7 change: time pickers use step="360" (6-min) instead of v6's step="60".

import { useState } from 'react';
import { ChevronRight, Compass, X } from '../Icons';

// displayAvg: what to show in the form (em-dash if unknown).
function displayAvg(distance, time) {
  const d = parseFloat(distance);
  const t = parseFloat(time);
  if (d > 0 && t > 0) return (d / t).toFixed(1);
  return '\u2013';
}
// persistAvg: the string to WRITE back into the voyage report. Same math,
// but we return '' (not an em-dash) when inputs are incomplete so the JSON
// stays round-trippable and the read-only detail view doesn't render
// sentinel glyphs as if they were data.
function persistAvg(distance, time) {
  const d = parseFloat(distance);
  const t = parseFloat(time);
  if (d > 0 && t > 0) return (d / t).toFixed(1);
  return '';
}

// Recompute every derived average speed on the voyage report so the stored
// object is the one of record — the read-only VoyageReportDetail renders
// `avgSpeed` / `averageSpeed` fields directly without recomputing.
function withDerivedSpeeds(vr) {
  return {
    ...vr,
    departure: {
      ...vr.departure,
      pierToFA: {
        ...vr.departure.pierToFA,
        avgSpeed: persistAvg(vr.departure.pierToFA.distance, vr.departure.pierToFA.time),
      },
    },
    voyage: {
      ...vr.voyage,
      averageSpeed: persistAvg(vr.voyage.totalMiles, vr.voyage.steamingTime),
    },
    arrival: {
      ...vr.arrival,
      sbeToBerth: {
        ...vr.arrival.sbeToBerth,
        avgSpeed: persistAvg(vr.arrival.sbeToBerth.distance, vr.arrival.sbeToBerth.time),
      },
    },
  };
}

export function VoyageReportSection({
  voyageReport,
  onChange,
  onDelete,
  depPort,
  arrPort,
  depDate,
  arrDate,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const vr = voyageReport;

  const updateField  = (section, field, value) =>
    onChange(withDerivedSpeeds({ ...vr, [section]: { ...vr[section], [field]: value } }));
  const updateNested = (section, sub, field, value) =>
    onChange(withDerivedSpeeds({
      ...vr,
      [section]: { ...vr[section], [sub]: { ...vr[section][sub], [field]: value } },
    }));

  const voyageAvgSpeed   = displayAvg(vr.voyage.totalMiles, vr.voyage.steamingTime);
  const pierToFASpeed    = displayAvg(vr.departure.pierToFA.distance, vr.departure.pierToFA.time);
  const sbeToBerthSpeed  = displayAvg(vr.arrival.sbeToBerth.distance, vr.arrival.sbeToBerth.time);

  return (
    <div className="cat-card nav rounded-xl overflow-hidden mb-4">
      <div
        className="px-4 py-2.5 cursor-pointer flex justify-between items-center transition-all"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2.5">
          <span className={`transition-transform duration-300 ${collapsed ? '' : 'rotate-90'}`}
                style={{ color: 'var(--color-faint)' }}>
            <ChevronRight className="w-4 h-4" />
          </span>
          <span style={{ color: 'var(--color-water)' }}>
            <Compass className="w-4 h-4" />
          </span>
          <div>
            <span className="cat-label" style={{ padding: 0, letterSpacing: '1.5px' }}>Voyage Report</span>
            {collapsed && (
              <p className="text-[0.6rem] font-mono mt-0.5" style={{ color: 'var(--color-dim)' }}>
                {depPort || 'From'} {'\u2192'} {arrPort || 'To'}
                {vr.voyage.totalMiles ? ` \u2022 ${vr.voyage.totalMiles} nm` : ''}
                {voyageAvgSpeed !== '\u2013' ? ` \u2022 ${voyageAvgSpeed} kts` : ''}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {vr.voyage.totalMiles && (
            <span className="total-pill mono text-[0.75rem]">{vr.voyage.totalMiles} nm</span>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--color-faint)' }}
              title="Remove Voyage Report"
              aria-label="Remove Voyage Report"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div style={{ borderTop: '1px solid var(--color-water-border)' }}>
          {/* Top row: ports + dates (read-only, sourced from engine reports) */}
          <div className="grid grid-cols-4 gap-3 px-4 py-2.5"
               style={{ background: 'rgba(2,132,199,0.03)' }}>
            <ReadField label="From" value={depPort} placeholder="Set in Departure" />
            <ReadField label="To"   value={arrPort} placeholder="Set in Arrival"   />
            <ReadField label="Dep. Date" value={depDate} mono placeholder="\u2013" />
            <ReadField label="Arr. Date" value={arrDate} mono placeholder="\u2013" />
          </div>

          {/* 3-column grid */}
          <div className="vr-grid">
            {/* DEPARTURE */}
            <div className="vr-col">
              <div className="vr-col-head">Departure</div>
              <div className="vr-field">
                <div>
                  <label className="form-label">SBE</label>
                  <input type="time" step="360" value={vr.departure.sbe}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateField('departure', 'sbe', e.target.value)}
                    className="form-input font-mono text-[0.78rem]" />
                </div>
                <div>
                  <label className="form-label">FA (Full Away)</label>
                  <input type="time" step="360" value={vr.departure.fa}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateField('departure', 'fa', e.target.value)}
                    className="form-input font-mono text-[0.78rem]" />
                </div>
              </div>
              <div className="vr-sub-head">Pier {'\u2192'} FA</div>
              <div className="vr-field">
                <div>
                  <label className="form-label">Dist (nm)</label>
                  <input type="number" step="0.1" value={vr.departure.pierToFA.distance}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateNested('departure', 'pierToFA', 'distance', e.target.value)}
                    className="form-input font-mono text-[0.78rem]" />
                </div>
                <div>
                  <label className="form-label">Time (h)</label>
                  <input type="number" step="0.1" value={vr.departure.pierToFA.time}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateNested('departure', 'pierToFA', 'time', e.target.value)}
                    className="form-input font-mono text-[0.78rem]" />
                </div>
              </div>
              <div className="vr-calc mono">Avg: {pierToFASpeed} kts</div>
            </div>

            {/* SEA PASSAGE */}
            <div className="vr-col">
              <div className="vr-col-head">Sea Passage (FA {'\u2192'} SBE)</div>
              <div className="vr-field-full">
                <label className="form-label">Total Miles</label>
                <input type="number" step="0.1" value={vr.voyage.totalMiles}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => updateField('voyage', 'totalMiles', e.target.value)}
                  className="form-input font-mono text-[0.78rem]" />
              </div>
              <div className="vr-field-full">
                <label className="form-label">Steaming Time (h)</label>
                <input type="number" step="0.1" value={vr.voyage.steamingTime}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => updateField('voyage', 'steamingTime', e.target.value)}
                  className="form-input font-mono text-[0.78rem]" />
              </div>
              <div className="vr-calc mono"
                   style={{ marginTop: '0.5rem', fontSize: '1.1rem', padding: '0.6rem' }}>
                {voyageAvgSpeed} kts
              </div>
              <div className="text-center text-[0.5rem] mt-1 uppercase tracking-wider font-bold"
                   style={{ color: 'var(--color-faint)' }}>
                Average Speed
              </div>
            </div>

            {/* ARRIVAL */}
            <div className="vr-col">
              <div className="vr-col-head">Arrival</div>
              <div className="vr-field">
                <div>
                  <label className="form-label">SBE</label>
                  <input type="time" step="360" value={vr.arrival.sbe}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateField('arrival', 'sbe', e.target.value)}
                    className="form-input font-mono text-[0.78rem]" />
                </div>
                <div>
                  <label className="form-label">FWE</label>
                  <input type="time" step="360" value={vr.arrival.fwe}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateField('arrival', 'fwe', e.target.value)}
                    className="form-input font-mono text-[0.78rem]" />
                </div>
              </div>
              <div className="vr-sub-head">SBE {'\u2192'} Berth</div>
              <div className="vr-field">
                <div>
                  <label className="form-label">Dist (nm)</label>
                  <input type="number" step="0.1" value={vr.arrival.sbeToBerth.distance}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateNested('arrival', 'sbeToBerth', 'distance', e.target.value)}
                    className="form-input font-mono text-[0.78rem]" />
                </div>
                <div>
                  <label className="form-label">Time (h)</label>
                  <input type="number" step="0.1" value={vr.arrival.sbeToBerth.time}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateNested('arrival', 'sbeToBerth', 'time', e.target.value)}
                    className="form-input font-mono text-[0.78rem]" />
                </div>
              </div>
              <div className="vr-calc mono">Avg: {sbeToBerthSpeed} kts</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReadField({ label, value, placeholder, mono = false }) {
  return (
    <div>
      <label className="form-label">{label}</label>
      <div className={`text-[0.82rem] py-1 ${mono ? 'font-mono' : 'font-semibold'}`}
           style={{ color: 'var(--color-text)' }}>
        {value || (
          <span className="italic font-normal" style={{ color: 'var(--color-faint)' }}>
            {placeholder}
          </span>
        )}
      </div>
    </div>
  );
}
