// TreeNode — recursive node renderer.
// Hierarchy:
//   Voyage (anchor) ▸
//     ├ Voyage Detail (▤)
//     ├ Leg 1 (⇆) ▸
//     │   ├ Departure (↗)
//     │   ├ Arrival (↘)
//     │   └ Voyage Report (⎈)  — only on legs that have one
//     ├ Leg 2 …
//     └ Voyage End (⚑)        — only when voyage.voyageEnd is set

import { useVoyageStore } from '../../hooks/useVoyageStore';

function isSel(selected, match) {
  if (!selected) return false;
  for (const k of Object.keys(match)) if (selected[k] !== match[k]) return false;
  return true;
}

function chev(open) {
  return <span className="tree-chev">{open ? '▾' : '▸'}</span>;
}

function spacer() {
  return <span className="tree-chev" />;
}

export function TreeNode({ entry }) {
  const { expanded, toggleExpand, selected, select, loadedById, loadVoyage } = useVoyageStore();
  const open = expanded.has(entry.filename);
  const v = loadedById[entry.filename];

  const onToggle = (e) => {
    e.stopPropagation();
    toggleExpand(entry.filename);
    if (!v) loadVoyage(entry.filename);
  };

  const selectedOnVoyage = isSel(selected, { filename: entry.filename, kind: 'voyage' });

  return (
    <div role="treeitem" aria-expanded={open}>
      <button
        type="button"
        className={`tree-node ${selectedOnVoyage ? 'selected' : ''}`}
        onClick={() => select({ filename: entry.filename, kind: 'voyage' })}
      >
        <span onClick={onToggle} role="button" aria-label={open ? 'Collapse' : 'Expand'}>
          {chev(open)}
        </span>
        <span className="tree-icon">⚓</span>
        <span className="flex-1 truncate">{entry.name || entry.filename}</span>
        {entry.ended && (
          <span
            className="text-[0.55rem] font-bold px-1.5 py-0.5 rounded"
            style={{ background: 'var(--color-surface2)', color: 'var(--color-dim)' }}
            title="Voyage ended"
          >
            END
          </span>
        )}
      </button>

      {open && (
        <div
          className="ml-4 pl-2 border-l"
          style={{ borderColor: 'var(--color-border-subtle)' }}
        >
          {!v ? (
            <div className="tree-node" style={{ color: 'var(--color-faint)', cursor: 'default' }}>
              {spacer()}
              <span className="tree-icon">…</span>
              <span className="truncate italic">Loading…</span>
            </div>
          ) : (
            <VoyageChildren entry={entry} voyage={v} />
          )}
        </div>
      )}
    </div>
  );
}

function VoyageChildren({ entry, voyage }) {
  const { selected, select } = useVoyageStore();

  return (
    <>
      {/* Voyage Detail */}
      <button
        type="button"
        className={`tree-node ${isSel(selected, { filename: entry.filename, kind: 'voyage' }) ? '' : ''}`}
        onClick={() => select({ filename: entry.filename, kind: 'voyage' })}
        style={{
          background: isSel(selected, { filename: entry.filename, kind: 'voyage' })
            ? 'rgba(6,182,212,0.10)' : 'transparent',
        }}
      >
        {spacer()}
        <span className="tree-icon">▤</span>
        <span className="truncate">Voyage Detail</span>
      </button>

      {/* Legs */}
      {voyage.legs?.map((leg, idx) => (
        <LegNode key={leg.id} entry={entry} leg={leg} index={idx} />
      ))}

      {/* Voyage End */}
      {voyage.voyageEnd && (
        <button
          type="button"
          className={`tree-node ${isSel(selected, { filename: entry.filename, kind: 'voyageEnd' }) ? 'selected' : ''}`}
          onClick={() => select({ filename: entry.filename, kind: 'voyageEnd' })}
        >
          {spacer()}
          <span className="tree-icon">⚑</span>
          <span className="truncate">Voyage End</span>
        </button>
      )}
    </>
  );
}

function LegNode({ entry, leg, index }) {
  const { expanded, toggleExpand, selected, select } = useVoyageStore();
  const key = `${entry.filename}::${leg.id}`;
  const open = expanded.has(key);
  const onToggle = (e) => { e.stopPropagation(); toggleExpand(key); };

  const legSelected = isSel(selected, { filename: entry.filename, kind: 'leg', legId: leg.id });
  const depPort = leg.departure?.port?.split(',')[0]?.trim() || 'Dep';
  const arrPort = leg.arrival?.port?.split(',')[0]?.trim() || 'Arr';

  return (
    <div role="treeitem" aria-expanded={open}>
      <button
        type="button"
        className={`tree-node ${legSelected ? 'selected' : ''}`}
        onClick={() => {
          select({ filename: entry.filename, kind: 'leg', legId: leg.id });
          if (!open) toggleExpand(key);
        }}
      >
        <span onClick={onToggle} role="button" aria-label={open ? 'Collapse' : 'Expand'}>
          {chev(open)}
        </span>
        <span className="tree-icon">⇆</span>
        <span className="flex-1 truncate">
          <span className="font-mono text-[0.7rem]" style={{ color: 'var(--color-faint)' }}>L{index + 1}</span>{' '}
          {depPort} → {arrPort}
        </span>
      </button>

      {open && (
        <div
          className="ml-4 pl-2 border-l"
          style={{ borderColor: 'var(--color-border-subtle)' }}
        >
          <ReportChild
            filename={entry.filename}
            legId={leg.id}
            kind="departure"
            label="Departure"
            icon="↗"
          />
          <ReportChild
            filename={entry.filename}
            legId={leg.id}
            kind="arrival"
            label="Arrival"
            icon="↘"
          />
          <ReportChild
            filename={entry.filename}
            legId={leg.id}
            kind="voyageReport"
            label="Voyage Report"
            icon="⎈"
          />
        </div>
      )}
    </div>
  );
}

function ReportChild({ filename, legId, kind, label, icon }) {
  const { selected, select } = useVoyageStore();
  const sel = isSel(selected, { filename, kind, legId });
  return (
    <button
      type="button"
      className={`tree-node ${sel ? 'selected' : ''}`}
      onClick={() => select({ filename, kind, legId })}
    >
      {spacer()}
      <span className="tree-icon">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
