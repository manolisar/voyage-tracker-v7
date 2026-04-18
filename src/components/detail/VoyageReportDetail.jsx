// VoyageReportDetail — read-only "Voyage Report" navigation card on a leg.
// Mirrors v6's VoyageReportSection but read-only for Phase 4. Phase 5 swaps
// in the editable component.

export function VoyageReportDetail({ leg }) {
  const vr = leg?.voyageReport;
  if (!vr) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center">
        <p style={{ color: 'var(--color-dim)' }}>No voyage report on this leg.</p>
      </div>
    );
  }

  const dep = vr.departure || {};
  const voy = vr.voyage || {};
  const arr = vr.arrival || {};
  const p2f = dep.pierToFA || {};
  const s2b = arr.sbeToBerth || {};

  return (
    <div className="max-w-5xl mx-auto">
      <section className="glass-card rounded-2xl overflow-hidden mb-5">
        <div className="leg-head px-5 py-4 flex items-center gap-3">
          <span className="text-[0.6rem] font-bold tracking-wider uppercase px-2 py-0.5 rounded"
            style={{ background: 'rgba(2,132,199,0.10)', color: 'var(--color-water)' }}>
            ⎈ Voyage Report
          </span>
          <div className="flex-1" />
          <span className="total-pill">{voy.totalMiles ? `${voy.totalMiles} NM` : '—'}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
          {/* Departure */}
          <Block title="Departure">
            <Field label="SBE" value={dep.sbe} />
            <Field label="FA"  value={dep.fa} />
            <SubHead>Pier → FA</SubHead>
            <Field label="Distance" value={p2f.distance} suffix="NM" />
            <Field label="Time"     value={p2f.time}     suffix="h"  />
            <Calc>{p2f.avgSpeed ? `${p2f.avgSpeed} kn avg` : '—'}</Calc>
          </Block>

          {/* Voyage */}
          <Block title="Voyage">
            <Field label="Total miles"   value={voy.totalMiles}   suffix="NM" />
            <Field label="Steaming time" value={voy.steamingTime} suffix="h"  />
            <Calc>{voy.averageSpeed ? `${voy.averageSpeed} kn avg` : '—'}</Calc>
          </Block>

          {/* Arrival */}
          <Block title="Arrival" last>
            <Field label="SBE" value={arr.sbe} />
            <Field label="FWE" value={arr.fwe} />
            <SubHead>SBE → Berth</SubHead>
            <Field label="Distance" value={s2b.distance} suffix="NM" />
            <Field label="Time"     value={s2b.time}     suffix="h"  />
            <Calc>{s2b.avgSpeed ? `${s2b.avgSpeed} kn avg` : '—'}</Calc>
          </Block>
        </div>
      </section>
    </div>
  );
}

function Block({ title, children, last }) {
  return (
    <div
      className="p-4"
      style={{ borderRight: last ? 'none' : '1px solid var(--color-border-subtle)' }}
    >
      <div
        className="text-[0.5rem] font-bold tracking-[1.2px] uppercase mb-3"
        style={{ color: 'var(--color-water)' }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function SubHead({ children }) {
  return (
    <div
      className="text-[0.5rem] font-bold tracking-wider uppercase mt-3 mb-1"
      style={{ color: 'var(--color-faint)' }}
    >
      {children}
    </div>
  );
}

function Field({ label, value, suffix }) {
  return (
    <div className="grid grid-cols-2 gap-2 items-end mb-1.5">
      <div className="form-label" style={{ marginBottom: 0 }}>{label}</div>
      <div className="font-mono text-[0.85rem] font-bold text-right" style={{ color: 'var(--color-text)' }}>
        {value ? `${value}${suffix ? ` ${suffix}` : ''}` : '—'}
      </div>
    </div>
  );
}

function Calc({ children }) {
  return (
    <div
      className="text-[0.72rem] font-bold font-mono px-2 py-1.5 mt-2 rounded text-center"
      style={{ background: 'rgba(2,132,199,0.06)', color: 'var(--color-water)' }}
    >
      {children}
    </div>
  );
}
