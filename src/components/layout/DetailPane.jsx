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

import { useEffect, useCallback, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useVoyageStore } from '../../hooks/useVoyageStore';
import { defaultDensities } from '../../domain/shipClass';
import { defaultVoyageReport } from '../../domain/factories';
import { EmptyState } from '../detail/EmptyState';
import { VoyageDetail } from '../detail/VoyageDetail';
import { ReportDetail } from '../detail/ReportDetail';
import { VoyageReportDetail } from '../detail/VoyageReportDetail';
import { VoyageEndDetail } from '../detail/VoyageEndDetail';
import { ReportForm } from '../voyage/ReportForm';
import { VoyageReportSection } from '../voyage/VoyageReportSection';
import { FloatingCarryOverButton } from '../ui/FloatingCarryOverButton';
import { ManualCarryOverModal } from '../modals/ManualCarryOverModal';

export function DetailPane({ ship, shipClass, onAddLeg, onEndVoyage }) {
  const { editMode } = useAuth();
  const {
    selected, loadedById, loadVoyage, loadingFiles, updateVoyage,
    trackPhaseEnd,
  } = useVoyageStore();

  const [carryOverOpen, setCarryOverOpen] = useState(false);

  // Lazily make sure the selected voyage is loaded.
  useEffect(() => {
    if (selected?.filename && !loadedById[selected.filename]) {
      loadVoyage(selected.filename);
    }
  }, [selected, loadedById, loadVoyage]);

  // Helper: produce an `onChange` for a given leg's report (departure|arrival).
  // Also diffs the incoming report against the previous one to detect the
  // LATEST phase whose equipment END value changed — when we find one, we
  // stamp it into `lastEditedPhase` so the floating carry-over button knows
  // where to carry from.
  const onReportChange = useCallback((filename, legId, kind, newReport) => {
    updateVoyage(filename, (v) => {
      const oldLeg = v.legs.find((l) => l.id === legId);
      const oldReport = oldLeg?.[kind];
      // Find the phase whose equipment END value just changed, if any.
      if (oldReport?.phases && newReport?.phases) {
        for (const newPhase of newReport.phases) {
          const oldPhase = oldReport.phases.find((p) => p.id === newPhase.id);
          if (!oldPhase) continue;
          let changedEndKey = null;
          for (const eqKey of Object.keys(newPhase.equipment || {})) {
            const newEnd = newPhase.equipment?.[eqKey]?.end;
            const oldEnd = oldPhase.equipment?.[eqKey]?.end;
            if (newEnd !== oldEnd) { changedEndKey = eqKey; break; }
          }
          if (changedEndKey) {
            // Build the equipment snapshot from the NEW phase so the modal
            // previews fresh values.
            const equipmentSnapshot = {};
            for (const [k, eq] of Object.entries(newPhase.equipment || {})) {
              if (eq?.end !== '' && eq?.end != null) equipmentSnapshot[k] = eq.end;
            }
            trackPhaseEnd({
              filename, legId, kind,
              phaseId: newPhase.id,
              phaseName: newPhase.name || (kind === 'departure' ? 'Departure Phase' : 'Arrival Phase'),
              equipment: equipmentSnapshot,
            });
            break;
          }
        }
      }
      return {
        ...v,
        legs: v.legs.map((l) => l.id === legId ? { ...l, [kind]: newReport } : l),
      };
    });
  }, [updateVoyage, trackPhaseEnd]);

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
          <FloatingCarryOverButton onClick={() => setCarryOverOpen(true)} />
          {carryOverOpen && (
            <ManualCarryOverModal
              shipClass={shipClass}
              onClose={() => setCarryOverOpen(false)}
            />
          )}
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
    // Legacy legs (pre-v7 imports) may have voyageReport: null. Seed an empty
    // one on first visit so the form has something to bind to. The mockup
    // treats Voyage Report as always-present per leg.
    const vr = leg.voyageReport || defaultVoyageReport();
    if (editMode) {
      if (!leg.voyageReport) {
        onVoyageReportChange(voyage.filename, leg.id, vr);
      }
      return (
        <div className="max-w-5xl mx-auto">
          <VoyageReportSection
            voyageReport={vr}
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
    return <VoyageReportDetail leg={{ ...leg, voyageReport: vr }} />;
  }

  return <EmptyState ship={ship} />;
}
