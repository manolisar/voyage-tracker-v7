// GitHub storage adapter — implements the same shape as localAdapter
// (see ../adapter.js for the contract).
//
// Construction:
//
//   const adapter = createGithubAdapter({
//     owner:    'manolisar',
//     repo:     'voyage-tracker-data',
//     branch:   'main',
//     getToken: () => auth.adminToken,           // refreshed on each call
//     getEditorRole: () => auth.editor,          // recorded in commit trailer
//   });
//   setStorageAdapter(adapter);
//
// `getToken` and `getEditorRole` are accessors (not values) so the adapter
// always sees the freshest auth state without needing to be rebuilt on PAT
// rotation or role change.

import { listVoyages, loadVoyage, saveVoyage, deleteVoyage, upsertShipIndex } from './contents';
import { listRecentCommits } from './commits';
import { loadAuthJson, saveAuthJson, bootstrapShipIndex } from './authConfig';

export function createGithubAdapter({
  owner,
  repo,
  branch = 'main',
  getToken,
  getEditorRole = () => null,
}) {
  if (!owner || !repo) throw new Error('createGithubAdapter: owner + repo required');
  if (typeof getToken !== 'function') throw new Error('createGithubAdapter: getToken function required');

  const ctx = { owner, repo, branch, getToken };

  return {
    backend: 'github',
    listVoyages: (shipId) =>
      listVoyages(ctx, shipId),
    loadVoyage: (shipId, filename) =>
      loadVoyage(ctx, shipId, filename),
    saveVoyage: (shipId, filename, voyage, prevSha) =>
      saveVoyage(ctx, shipId, filename, voyage, prevSha, { editorRole: getEditorRole() }),
    deleteVoyage: (shipId, filename, prevSha) =>
      deleteVoyage(ctx, shipId, filename, prevSha, { editorRole: getEditorRole() }),
    // Called by createVoyage / endVoyage so the manifest (_index.json) tracks
    // the latest status flag and any new filenames. Fire-and-forget — errors
    // are logged but not surfaced to the user.
    upsertIndex: (shipId, filename, entry) =>
      upsertShipIndex(ctx, shipId, filename, entry, { editorRole: getEditorRole() }),

    // Admin-only ops (Phase 6). Present only on the github adapter.
    admin: {
      listRecentCommits: (opts) => listRecentCommits(ctx, opts),
      loadAuthJson: () => loadAuthJson(ctx),
      saveAuthJson: (config, prevSha, opts) =>
        saveAuthJson(ctx, config, prevSha, { editorRole: getEditorRole(), ...(opts || {}) }),
      bootstrapShipIndex: (shipId) =>
        bootstrapShipIndex(ctx, shipId, { editorRole: getEditorRole() }),
      repo: { owner, repo, branch },
    },
  };
}

export { verifyToken } from './client';
export * from './errors';
