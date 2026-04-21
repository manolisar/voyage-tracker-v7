// TimePicker6Min — HH:MM picker constrained to 6-minute slots.
//
// Why not <input type="time" step="360">?
//   Chromium's native time picker popup IGNORES the step attribute for
//   the minute column — it always shows 1-min granularity. Step only
//   applies to the up/down spinner arrows and form validation, not the
//   popup wheel. So even with step="360" the crew sees "12, 13, 14, 15"
//   in the popup and can pick invalid (non-6-min) times.
//
// This component renders two tiny selects (hour + minute) that look like
// one field thanks to the wrapping .form-input box. The minute select
// exposes ONLY 6-min slots (00, 06, 12, …, 54), so invalid values are
// impossible. In read-only mode it renders as a static mono div
// identical in shape to the other Field renderings — preserves view ↔
// edit parity.
//
// Value contract: parent sees the same "HH:MM" string it always did
// (e.g. "06:12"), or '' when either part is unset.

const MINUTE_SLOTS = [0, 6, 12, 18, 24, 30, 36, 42, 48, 54];
const HOUR_SLOTS = Array.from({ length: 24 }, (_, i) => i);

const pad2 = (n) => String(n).padStart(2, '0');

// Parse "HH:MM" → [hourStr, minStr] or ['', ''] on any failure. We keep
// the parts as strings so the <select value> round-trips cleanly when
// one side is set and the other isn't.
function parseParts(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return ['', ''];
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return ['', ''];
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!(h >= 0 && h <= 23) || !MINUTE_SLOTS.includes(mm)) return ['', ''];
  return [pad2(h), pad2(mm)];
}

// Recombine the two halves. Both must be set for us to emit a value;
// if either is '' we emit '' so downstream validation sees "unset".
function combine(hh, mm) {
  if (hh === '' || mm === '') return '';
  return `${hh}:${mm}`;
}

export function TimePicker6Min({ value, onChange, readOnly = false }) {
  const [hPart, mPart] = parseParts(value);

  if (readOnly) {
    return (
      <div
        className="form-input font-mono text-[0.78rem]"
        style={{ background: 'transparent', border: '1px solid transparent', cursor: 'default' }}
      >
        {value || '\u2014'}
      </div>
    );
  }

  // Two selects inside one .form-input-shaped wrapper so it visually
  // reads as one field. The inner selects strip their own borders and
  // padding; the outer div owns the chrome.
  return (
    <div
      className="form-input font-mono text-[0.78rem]"
      style={{
        padding: '0.25rem 0.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.1rem',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <select
        value={hPart}
        onChange={(e) => onChange(combine(e.target.value, mPart))}
        aria-label="Hour"
        style={{
          border: 'none',
          background: 'transparent',
          color: 'var(--color-text)',
          padding: '0.25rem 0.1rem',
          fontSize: '0.85rem',
          fontFamily: 'inherit',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        <option value="">--</option>
        {HOUR_SLOTS.map((h) => (
          <option key={h} value={pad2(h)}>{pad2(h)}</option>
        ))}
      </select>
      <span style={{ color: 'var(--color-faint)' }}>:</span>
      <select
        value={mPart}
        onChange={(e) => onChange(combine(hPart, e.target.value))}
        aria-label="Minute"
        style={{
          border: 'none',
          background: 'transparent',
          color: 'var(--color-text)',
          padding: '0.25rem 0.1rem',
          fontSize: '0.85rem',
          fontFamily: 'inherit',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        <option value="">--</option>
        {MINUTE_SLOTS.map((mm) => (
          <option key={mm} value={pad2(mm)}>{pad2(mm)}</option>
        ))}
      </select>
    </div>
  );
}
