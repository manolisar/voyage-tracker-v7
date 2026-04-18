// ReportDetail — read-only Departure/Arrival summary.
// Phase 5 swaps in v6's interactive ReportForm. For Phase 4 we render a
// non-editable summary so the demo voyage is fully viewable.

import { calcConsumption, calcPhaseTotals, formatMT } from '../../domain/calculations';
import { defaultDensities, equipmentDef, equipmentLabel } from '../../domain/shipClass';

export function ReportDetail({ voyage, leg, kind, shipClass }) {
  const report = leg?.[kind];
  if (!report) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center">
        <p style={{ color: 'var(--color-dim)' }}>No {kind} report on this leg yet.</p>
      </div>
    );
  }

  const densities = voyage.densities || defaultDensities(shipClass);
  const isDep = kind === 'departure';

  return (
    <div className="max-w-5xl mx-auto">
      <section className="glass-card rounded-2xl overflow-hidden mb-5">
        <div className="leg-head px-5 py-4 flex items-center gap-3 flex-wrap">
          <span className="text-[0.6rem] font-bold tracking-wider uppercase px-2 py-0.5 rounded"
            style={{
              background: isDep ? 'rgba(217,119,6,0.10)' : 'rgba(2,132,199,0.10)',
              color: isDep ? 'var(--color-hfo)' : 'var(--color-water)',
            }}>
            {isDep ? '↗ Departure' : '↘ Arrival'}
          </span>
          <div className="text-[1.05rem] font-extrabold tracking-tight" style={{ color: 'var(--color-text)' }}>
            {report.port || 'Unknown port'}
          </div>
          <div className="flex-1" />
          <div className="total-pill" title="Date">{report.date || '—'}</div>
        </div>
        <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Box label="Engineer" value={report.engineer} />
          <Box label="SBE" value={report.timeEvents?.sbe} mono />
          {isDep
            ? <Box label="FA"  value={report.timeEvents?.fa}  mono />
            : <Box label="FWE" value={report.timeEvents?.fwe} mono />}
          <Box label="Date" value={report.date} mono />
        </div>
      </section>

      {/* ROB + Bunkered */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <FuelTable title="Remaining On Board (MT)" data={report.rob} />
        <FuelTable title="Bunkered (MT)"           data={report.bunkered} />
      </section>

      {/* Phases */}
      <div className="section-label mb-3">Phases</div>
      {report.phases?.length ? report.phases.map((phase) => (
        <PhaseCard key={phase.id} phase={phase} densities={densities} shipClass={shipClass} />
      )) : (
        <p className="text-[0.78rem] italic" style={{ color: 'var(--color-dim)' }}>No phases.</p>
      )}

      {/* Fresh water + AEP (arrival only typically) */}
      {(report.freshWater || report.aep) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          {report.freshWater && (
            <div className="cat-card water">
              <div className="cat-label">Fresh Water (m³)</div>
              <div className="cat-body">
                <Mini label="ROB"        value={report.freshWater.rob} />
                <Mini label="Bunkered"   value={report.freshWater.bunkered} />
                <Mini label="Production" value={report.freshWater.production} />
                <Mini label="Consumption" value={report.freshWater.consumption} />
              </div>
            </div>
          )}
          {report.aep && (
            <div className="cat-card chem">
              <div className="cat-label">AEP (Open-loop scrubber)</div>
              <div className="cat-body">
                <Mini label="Open-loop hrs"   value={report.aep.openLoopHrs} />
                <Mini label="Closed-loop hrs" value={report.aep.closedLoopHrs} />
                <Mini label="Alkali cons (L)" value={report.aep.alkaliCons} />
                <Mini label="Alkali ROB (L)"  value={report.aep.alkaliRob} />
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Box({ label, value, mono }) {
  return (
    <div>
      <div className="form-label">{label}</div>
      <div
        className={`form-input ${mono ? 'font-mono' : ''}`}
        style={{ background: 'var(--color-surface2)', cursor: 'default' }}
      >
        {value || '—'}
      </div>
    </div>
  );
}

function Mini({ label, value, suffix }) {
  return (
    <div className="mini-row">
      <span className="mr-label">{label}</span>
      <span className="mr-val">{value ? `${value}${suffix ? ` ${suffix}` : ''}` : '—'}</span>
    </div>
  );
}

function FuelTable({ title, data }) {
  if (!data) return null;
  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="leg-head px-4 py-2 form-label" style={{ marginBottom: 0 }}>{title}</div>
      <div className="p-4 grid grid-cols-3 gap-3">
        {['hfo', 'mgo', 'lsfo'].map((k) => (
          <div key={k}>
            <div className="text-[0.55rem] font-bold tracking-wider uppercase" style={{ color: 'var(--color-faint)' }}>{k}</div>
            <div className="font-mono text-sm font-bold" style={{ color: 'var(--color-text)' }}>{data[k] || '—'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PhaseCard({ phase, densities, shipClass }) {
  const totals = calcPhaseTotals(phase, densities);
  return (
    <section className="glass-card rounded-xl overflow-hidden mb-3">
      <div className="leg-head px-4 py-2.5 flex items-center gap-2 flex-wrap">
        <span className="text-[0.6rem] font-bold tracking-wider uppercase"
          style={{ color: 'var(--color-dim)' }}>
          {phase.type}
        </span>
        <span className="text-[0.85rem] font-semibold" style={{ color: 'var(--color-text)' }}>
          {phase.name}
        </span>
        <div className="flex-1" />
        <span className="total-pill">{formatMT(totals.total)} MT</span>
      </div>

      <div className="p-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: 'var(--color-faint)' }}>
              <th className="text-left font-bold tracking-wider uppercase text-[0.55rem] px-2 py-1">Equipment</th>
              <th className="text-left font-bold tracking-wider uppercase text-[0.55rem] px-2 py-1">Fuel</th>
              <th className="text-right font-bold tracking-wider uppercase text-[0.55rem] px-2 py-1">Start (m³)</th>
              <th className="text-right font-bold tracking-wider uppercase text-[0.55rem] px-2 py-1">End (m³)</th>
              <th className="text-right font-bold tracking-wider uppercase text-[0.55rem] px-2 py-1">Δ (m³)</th>
              <th className="text-right font-bold tracking-wider uppercase text-[0.55rem] px-2 py-1">MT</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(phase.equipment || {}).map(([key, eq]) => {
              const cons = calcConsumption(eq.start, eq.end, eq.fuel, densities);
              const def = equipmentDef(shipClass, key);
              const start = parseFloat(eq.start);
              const end = parseFloat(eq.end);
              const dM3 = !isNaN(start) && !isNaN(end) ? end - start : null;
              return (
                <tr key={key} style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                  <td className="px-2 py-1.5 font-semibold" style={{ color: 'var(--color-text)' }}>
                    {equipmentLabel(shipClass, key)}{def?.locked && <span title="Fuel locked"> 🔒</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`fuel-badge ${String(eq.fuel || '').toLowerCase()}`}>
                      {eq.fuel || '—'}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">{eq.start || '—'}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{eq.end || '—'}</td>
                  <td className="px-2 py-1.5 text-right font-mono" style={{ color: 'var(--color-dim)' }}>
                    {dM3 != null ? dM3.toFixed(1) : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono font-bold">
                    {cons != null ? formatMT(cons) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {phase.remarks && (
        <div
          className="px-4 py-2.5 text-[0.75rem] italic"
          style={{
            color: 'var(--color-dim)',
            background: 'var(--color-surface2)',
            borderTop: '1px solid var(--color-border-subtle)',
          }}
        >
          {phase.remarks}
        </div>
      )}
    </section>
  );
}
