// VoyageReportSection — Bridge / navigation data per leg.
// 3 columns: Departure / Sea Passage / Arrival. Time and avg-speed fields
// are both derived — time falls out of the HH:MM timestamps on each side,
// avg speed falls out of distance / time.
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

// Parse "HH:MM" → minutes since midnight, or null if unparseable.
function parseHHMM(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (!(h >= 0 && h <= 23 && mm >= 0 && mm <= 59)) return null;
  return h * 60 + mm;
}

// Same-day HH:MM diff in minutes. If `end` < `start` we assume the range
// wrapped past midnight (rare for Pier→FA or SBE→Berth but cheap to handle).
// Returns null when either input is missing/invalid or delta is zero.
function diffMinutesSameDay(startHHMM, endHHMM) {
  const a = parseHHMM(startHHMM);
  const b = parseHHMM(endHHMM);
  if (a == null || b == null) return null;
  let mins = b - a;
  if (mins < 0) mins += 24 * 60;
  if (mins === 0) return null;
  return mins;
}

// Cross-date HH:MM diff in minutes, for total steaming time from FA(dep)
// on depDate to SBE(arr) on arrDate. Returns null on bad input or
// non-positive delta.
function diffMinutesWithDates(startDate, startHHMM, endDate, endHHMM) {
  if (!startDate || !endDate) return null;
  const a = parseHHMM(startHHMM);
  const b = parseHHMM(endHHMM);
  if (a == null || b == null) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const startIso = `${startDate}T${pad(Math.floor(a / 60))}:${pad(a % 60)}:00Z`;
  const endIso   = `${endDate}T${pad(Math.floor(b / 60))}:${pad(b % 60)}:00Z`;
  const startMs = Date.parse(startIso);
  const endMs   = Date.parse(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  if (endMs <= startMs) return null;
  return Math.round((endMs - startMs) / 60000);
}

// Minutes → "HH:mm" for display and persistence. The voyage JSON stores
// elapsed times in this format (crew-facing logbook notation) — avg-speed
// math converts it back to decimal hours on the fly.
function formatMinutes(mins) {
  if (mins == null) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Minutes → decimal hours (2dp) for avg-speed math. '' when null.
function minutesToDecimalHours(mins) {
  if (mins == null) return '';
  return (mins / 60).toFixed(2);
}

// Recompute every derived field on the voyage report so the stored object
// is the one of record — the read-only view renders `time` / `avgSpeed` /
// `steamingTime` / `averageSpeed` directly without recomputing.
//
// Derivation order matters: time depends on timestamps, avg speed depends
// on (distance, derived time).
function withDerivedFields(vr, depDate, arrDate) {
  const pMins = diffMinutesSameDay(vr.departure.sbe, vr.departure.fa);
  const aMins = diffMinutesSameDay(vr.arrival.sbe, vr.arrival.fwe);
  const sMins = diffMinutesWithDates(depDate, vr.departure.fa, arrDate, vr.arrival.sbe);
  return {
    ...vr,
    departure: {
      ...vr.departure,
      pierToFA: {
        ...vr.departure.pierToFA,
        time: formatMinutes(pMins),
        avgSpeed: persistAvg(vr.departure.pierToFA.distance, minutesToDecimalHours(pMins)),
      },
    },
    voyage: {
      ...vr.voyage,
      steamingTime: formatMinutes(sMins),
      averageSpeed: persistAvg(vr.voyage.totalMiles, minutesToDecimalHours(sMins)),
    },
    arrival: {
      ...vr.arrival,
      sbeToBerth: {
        ...vr.arrival.sbeToBerth,
        time: formatMinutes(aMins),
        avgSpeed: persistAvg(vr.arrival.sbeToBerth.distance, minutesToDecimalHours(aMins)),
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
  readOnly = false,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const vr = voyageReport;

  const updateField  = (section, field, value) =>
    onChange(withDerivedFields({ ...vr, [section]: { ...vr[section], [field]: value } }, depDate, arrDate));
  const updateNested = (section, sub, field, value) =>
    onChange(withDerivedFields({
      ...vr,
      [section]: { ...vr[section], [sub]: { ...vr[section][sub], [field]: value } },
    }, depDate, arrDate));

  // Times are derived from the timestamps; avg speed falls out of those.
  const pMins = diffMinutesSameDay(vr.departure.sbe, vr.departure.fa);
  const aMins = diffMinutesSameDay(vr.arrival.sbe, vr.arrival.fwe);
  const sMins = diffMinutesWithDates(depDate, vr.departure.fa, arrDate, vr.arrival.sbe);
  const pierToFATime    = formatMinutes(pMins);
  const sbeToBerthTime  = formatMinutes(aMins);
  const steamingTime    = formatMinutes(sMins);
  const pierToFASpeed   = displayAvg(vr.departure.pierToFA.distance, minutesToDecimalHours(pMins));
  const sbeToBerthSpeed = displayAvg(vr.arrival.sbeToBerth.distance, minutesToDecimalHours(aMins));
  const voyageAvgSpeed  = displayAvg(vr.voyage.totalMiles, minutesToDecimalHours(sMins));

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
          {!readOnly && onDelete && (
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
                <Field
                  label="SBE" type="time" step="360"
                  value={vr.departure.sbe} readOnly={readOnly}
                  onChange={(v) => updateField('departure', 'sbe', v)}
                />
                <Field
                  label="FA (Full Away)" type="time" step="360"
                  value={vr.departure.fa} readOnly={readOnly}
                  onChange={(v) => updateField('departure', 'fa', v)}
                />
              </div>
              <div className="vr-sub-head">Pier {'\u2192'} FA</div>
              <div className="vr-field">
                <Field
                  label="Dist (nm)" type="number" step="0.1"
                  value={vr.departure.pierToFA.distance} readOnly={readOnly}
                  onChange={(v) => updateNested('departure', 'pierToFA', 'distance', v)}
                />
                <DerivedField label="Time (hh:mm)" value={pierToFATime} />
              </div>
              <div className="vr-calc mono">Avg: {pierToFASpeed} kts</div>
            </div>

            {/* SEA PASSAGE */}
            <div className="vr-col">
              <div className="vr-col-head">Sea Passage (FA {'\u2192'} SBE)</div>
              <div className="vr-field-full">
                <Field
                  label="Total Miles" type="number" step="0.1"
                  value={vr.voyage.totalMiles} readOnly={readOnly}
                  onChange={(v) => updateField('voyage', 'totalMiles', v)}
                />
              </div>
              <div className="vr-field-full">
                <DerivedField label="Steaming Time (hh:mm)" value={steamingTime} />
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
                <Field
                  label="SBE" type="time" step="360"
                  value={vr.arrival.sbe} readOnly={readOnly}
                  onChange={(v) => updateField('arrival', 'sbe', v)}
                />
                <Field
                  label="FWE" type="time" step="360"
                  value={vr.arrival.fwe} readOnly={readOnly}
                  onChange={(v) => updateField('arrival', 'fwe', v)}
                />
              </div>
              <div className="vr-sub-head">SBE {'\u2192'} Berth</div>
              <div className="vr-field">
                <Field
                  label="Dist (nm)" type="number" step="0.1"
                  value={vr.arrival.sbeToBerth.distance} readOnly={readOnly}
                  onChange={(v) => updateNested('arrival', 'sbeToBerth', 'distance', v)}
                />
                <DerivedField label="Time (hh:mm)" value={sbeToBerthTime} />
              </div>
              <div className="vr-calc mono">Avg: {sbeToBerthSpeed} kts</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Unified field renderer: real `<input>` in edit mode, a static div that
// matches the input's dimensions in read-only mode. Keeps view and edit
// visually aligned so toggling Edit Mode doesn't reflow the card.
function Field({ label, type, step, value, onChange, readOnly }) {
  return (
    <div>
      <label className="form-label">{label}</label>
      {readOnly ? (
        <div
          className="form-input font-mono text-[0.78rem]"
          style={{ background: 'transparent', border: '1px solid transparent', cursor: 'default' }}
        >
          {value || '\u2014'}
        </div>
      ) : (
        <input
          type={type}
          step={step}
          value={value}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onChange(e.target.value)}
          className="form-input font-mono text-[0.78rem]"
        />
      )}
    </div>
  );
}

// DerivedField: a read-only field for values the form computes from other
// inputs (Time (hh:mm) falls out of the HH:MM timestamps, avg speed out of
// distance/time). Styled as an input-shaped box with a `calc` badge so it
// reads as "this was derived, not typed."
function DerivedField({ label, value }) {
  return (
    <div>
      <label className="form-label flex items-center gap-1.5">
        {label}
        <span
          className="text-[0.5rem] font-bold tracking-wider uppercase px-1 py-px rounded"
          style={{ background: 'rgba(2,132,199,0.10)', color: 'var(--color-water)' }}
          title="Derived from timestamps"
        >
          auto
        </span>
      </label>
      <div
        className="form-input font-mono text-[0.78rem]"
        style={{
          background: 'rgba(2,132,199,0.04)',
          borderStyle: 'dashed',
          borderColor: 'var(--color-water-border)',
          cursor: 'default',
          color: value ? 'var(--color-text)' : 'var(--color-faint)',
        }}
      >
        {value || '\u2014'}
      </div>
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
