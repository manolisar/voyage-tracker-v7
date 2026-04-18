// EmptyState — shown in the detail pane when nothing is selected.

import { Anchor } from '../Icons';

export function EmptyState({ ship }) {
  return (
    <div className="max-w-md mx-auto text-center mt-16">
      <div
        className="inline-flex w-16 h-16 rounded-2xl items-center justify-center text-white mb-5"
        style={{ background: 'var(--color-ocean-500)' }}
        aria-hidden="true"
      >
        <Anchor className="w-8 h-8" />
      </div>
      <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
        Pick a voyage
      </h2>
      <p className="text-sm" style={{ color: 'var(--color-dim)' }}>
        Click a voyage in the tree to see its detail.
        {ship ? ` (${ship.displayName} — ${ship.code})` : ''}
      </p>
    </div>
  );
}
