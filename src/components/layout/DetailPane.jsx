// DetailPane — routes the currently-selected tree node to the correct detail
// component. Uses VoyageStoreContext for selection + loaded data, and useAuth
// for editMode (Phase 5: edit-mode swaps in the editable v6-style forms).
//
// Selection shapes:
//   null                                                  → EmptyState
//   { filename, kind: 'voyage' }                          → VoyageDetail
//   { filename, kind: 'leg', legId }                      → VoyageDetail (leg has no own page)
//   { filename, kind: 'departure'|'arrival', legId }      → ReportDetail / ReportForm
//   { filename, kind: 'voyageReport', legId }             → VoyageReportDetail / VoyageReportSection
//   { filename, kind: 'voyageEnd' }                       → VoyageEndDetail

import { useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useVoyageStore } from '../../hooks/useVoyageStore';
import { defaultDensities } from '../../domain/shipClass';
import { EmptyState } from '../detail/EmptyState';
import { VoyageDetail } from '../detail/VoyageDetail';
import { ReportDetail } from '../detail/ReportDetail';
import { VoyageReportDetail } from '../detail/VoyageReportDetail';
import { VoyageEndDetail } from '../detail/VoyageEndDetail';
import { ReportForm } from '../voyage/ReportForm';
import { VoyageReportSection } from '../voyage/VoyageReportSection';

export function DetailPane({ ship, shipClass, onAddLeg, onEndVoyage }) {
  const { editMode } = useAuth();
  const { selected, loadedById, loadVoyage, loadingFiles, updateVoyage } = useVoyageStore();

  // Lazily make sure the selected voyage is loaded.
  useEffect(() => {
    if (selected?.filename && !loadedById[selected.filename]) {
      loadVoyage(selected.filename);
    }
  }, [selected, loadedById, loadVoyage]);

  // Helper: produce an `onChange` for a given leg's report (departure|arrival).
  const onReportChange = useCallback((filename, legId, kind, newReport) => {
    updateVoyage(filename, (v) => ({
      ...v,
      legs: v.legs.map((l) => l.id === legId ? { ...l, [kind]: newReport } : l),
    }));
  }, [updateVoyage]);

  const onVoyageReportChange = useCallback((filename, legId, newVR) => {
    updateVoyage(filename, (v) => ({
      ...v,
      legs: v.legs.map((l) => l.id === legId ? { ...l, voyageReport: newVR } : l),
    }));
  }, [updateVoyage]);

  if (!selected) return <EmptyState ship={ship} />;

  const voyage = loadedById[selected.filename];
  const isLoading = loadingFiles[selected.filename];

  if (!voyage) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center" style={{ color: 'var(--color-dim)' }}>
        {isLoading ? 'Loading voyage…' : 'Voyage not loaded.'}
      </div>
    );
  }

  if (selected.kind === 'voyage' || selected.kind === 'leg') {
    return (
      <VoyageDetail
        voyage={voyage}
        shipClass={shipClass}
        ship={ship}
        editMode={editMode}
        onAddLeg={onAddLeg}
        onEndVoyage={onEndVoyage}
      />
    );
  }

  if (selected.kind === 'voyageEnd') {
    return <VoyageEndDetail voyage={voyage} />;
  }

  const leg = voyage.legs?.find((l) => l.id === selected.legId) || null;
  if (!leg) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center" style={{ color: 'var(--color-error-fg)' }}>
        Leg not found in this voyage.
      </div>
    );
  }

  const densities = voyage.densities || defaultDensities(shipClass);

  if (selected.kind === 'departure' || selected.kind === 'arrival') {
    if (editMode && shipClass) {
      const report = leg[selected.kind];
      if (!report) {
        return (
          <div className="max-w-3xl mx-auto p-6 text-center" style={{ color: 'var(--color-dim)' }}>
            No {selected.kind} report on this leg.
          </div>
        );
      }
      return (
        <div className="max-w-5xl mx-auto">
          <ReportForm
            report={report}
            shipClass={shipClass}
            densities={densities}
            onChange={(newReport) => onReportChange(voyage.filename, leg.id, selected.kind, newReport)}
          />
        </div>
      );
    }
    return (
      <ReportDetail
        voyage={voyage}
        leg={leg}
        kind={selected.kind}
        shipClass={shipClass}
      />
    );
  }

  if (selected.kind === 'voyageReport') {
    if (editMode && leg.voyageReport) {
      return (
        <div className="max-w-5xl mx-auto">
          <VoyageReportSection
            voyageReport={leg.voyageReport}
            depPort={leg.departure?.port}
            arrPort={leg.arrival?.port}
            depDate={leg.departure?.date}
            arrDate={leg.arrival?.date}
            onChange={(newVR) => onVoyageReportChange(voyage.filename, leg.id, newVR)}
            onDelete={null}
          />
        </div>
      );
    }
    return <VoyageReportDetail leg={leg} />;
  }

  return <EmptyState ship={ship} />;
}
