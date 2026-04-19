// VoyageTree — top-level tree.
// Toolbar at the top (search/filter/refresh), then the list of visible voyages
// as TreeNodes, then a footer with count + storage path hint.

import { useAuth } from '../../hooks/useAuth';
import { useVoyageStore } from '../../hooks/useVoyageStore';
import { TreeToolbar } from './TreeToolbar';
import { TreeNode } from './TreeNode';

export function VoyageTree() {
  const { shipId } = useAuth();
  const { visibleVoyages, voyages, listLoading, listError } = useVoyageStore();

  // Suppress the redundant "no token" error — the AppShell banner already
  // tells the user how to connect, no need to scream the same thing twice
  // inside the tree.
  const isNoTokenError = listError && /no github token/i.test(listError);
  const showError = listError && !isNoTokenError;

  return (
    <div className="flex flex-col h-full min-h-0">
      <TreeToolbar />

      <div
        className="flex-1 overflow-y-auto min-h-0 p-2"
        role="tree"
        aria-label="Voyages"
      >
        {showError && (
          <div
            className="m-2 p-3 rounded-lg text-xs"
            style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-fg)' }}
            role="alert"
          >
            <strong>Failed to load voyages:</strong> {listError}
          </div>
        )}

        {isNoTokenError && (
          <div className="p-6 text-center text-xs" style={{ color: 'var(--color-dim)' }}>
            Connect to the data repo to load voyages.
          </div>
        )}

        {listLoading && voyages.length === 0 && (
          <div className="p-6 text-center text-xs" style={{ color: 'var(--color-dim)' }}>
            Loading voyages…
          </div>
        )}

        {!listLoading && !listError && visibleVoyages.length === 0 && voyages.length === 0 && (
          <div className="p-6 text-center text-xs" style={{ color: 'var(--color-dim)' }}>
            No voyages yet for this ship.
          </div>
        )}

        {!listLoading && !listError && visibleVoyages.length === 0 && voyages.length > 0 && (
          <div className="p-6 text-center text-xs" style={{ color: 'var(--color-dim)' }}>
            No voyages match this filter.
          </div>
        )}

        {visibleVoyages.map((entry) => (
          <TreeNode key={entry.filename} entry={entry} />
        ))}
      </div>

      <div
        className="shrink-0 px-3 py-2 border-t text-[0.6rem] font-mono flex items-center justify-between"
        style={{ borderColor: 'var(--color-border-subtle)', color: 'var(--color-faint)' }}
      >
        <span>{visibleVoyages.length} voyage{visibleVoyages.length === 1 ? '' : 's'}</span>
        <span>data/{shipId}/</span>
      </div>
    </div>
  );
}
