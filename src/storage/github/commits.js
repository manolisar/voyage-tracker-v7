// Commit-message formatting.
//
// CLAUDE.md §12 mandates the format:
//
//   [<shipId>] <action>: <filename>
//
//   Voyage: <human label>
//   Editor-Role: <Chief|Second|Bridge|Other>
//   App-Version: 7.0.0
//
// The structured trailer is what the Admin Panel parses for the audit log,
// so don't change keys without updating parseCommitTrailer() too.

import { APP_VERSION, EDITOR_ROLES } from '../../domain/constants';
import { ghFetch } from './client';

const ROLE_LABEL = {
  [EDITOR_ROLES.CHIEF]:  'Chief',
  [EDITOR_ROLES.SECOND]: 'Second',
  [EDITOR_ROLES.BRIDGE]: 'Bridge',
  [EDITOR_ROLES.OTHER]:  'Other',
};

function voyageLabel(voyage, filename) {
  if (!voyage) return filename;
  const id = voyage.startDate || '';
  const name = voyage.name || '';
  const trimmed = `${id} ${name}`.trim();
  return trimmed || filename;
}

/**
 * Build a commit message for any data-repo write.
 *
 * @param {object} args
 * @param {'save'|'delete'|'create'} args.action
 * @param {string} args.shipId
 * @param {string} args.filename
 * @param {object|null} [args.voyage]   — for the Voyage: trailer line
 * @param {string|null} [args.editorRole] — one of EDITOR_ROLES.*
 * @param {string} [args.appVersion]
 * @returns {string} multi-line commit message
 */
export function formatCommitMessage({
  action,
  shipId,
  filename,
  voyage = null,
  editorRole = null,
  appVersion = APP_VERSION,
}) {
  const subject = `[${shipId}] ${action}: ${filename}`;
  const trailer = [
    `Voyage: ${voyageLabel(voyage, filename)}`,
    `Editor-Role: ${ROLE_LABEL[editorRole] || 'Other'}`,
    `App-Version: ${appVersion}`,
  ].join('\n');
  return `${subject}\n\n${trailer}`;
}

/**
 * Parse the structured trailer back out of a commit message. Returns null if
 * the message isn't in our format (e.g. hand-edited via the GitHub web UI).
 *
 * @param {string} message
 * @returns {{shipId, action, filename, voyage, editorRole, appVersion} | null}
 */
export function parseCommitTrailer(message) {
  if (!message) return null;
  const lines = message.split(/\r?\n/);
  const subject = lines[0] || '';
  const m = subject.match(/^\[([^\]]+)\]\s+(\w+):\s+(.+)$/);
  if (!m) return null;
  const [, shipId, action, filename] = m;

  const trailer = {};
  for (const line of lines.slice(1)) {
    const t = line.match(/^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/);
    if (t) trailer[t[1]] = t[2];
  }
  return {
    shipId,
    action,
    filename,
    voyage:     trailer.Voyage      || null,
    editorRole: trailer['Editor-Role'] || null,
    appVersion: trailer['App-Version'] || null,
  };
}

/**
 * List recent commits to the data repo, optionally scoped to a ship.
 * Used by the Admin Panel as a poor-man's audit log.
 *
 * @param {{owner,repo,branch,getToken}} ctx
 * @param {object} [opts]
 * @param {string} [opts.shipId]  — restrict to commits touching `data/<shipId>/`
 * @param {number} [opts.limit]   — default 30, max 100
 * @returns {Promise<Array<{sha, date, author, subject, message, parsed}>>}
 */
export async function listRecentCommits(ctx, { shipId = null, limit = 30 } = {}) {
  const params = new URLSearchParams();
  params.set('per_page', String(Math.min(limit, 100)));
  if (ctx.branch) params.set('sha', ctx.branch);
  if (shipId) params.set('path', `data/${shipId}`);

  const { data } = await ghFetch(
    `/repos/${ctx.owner}/${ctx.repo}/commits?${params.toString()}`,
    { getToken: ctx.getToken },
  );

  if (!Array.isArray(data)) return [];
  return data.map((c) => {
    const message = c?.commit?.message || '';
    const subject = message.split(/\r?\n/)[0] || '';
    return {
      sha:     c.sha,
      date:    c?.commit?.author?.date || null,
      author:  c?.commit?.author?.name || c?.author?.login || '(unknown)',
      subject,
      message,
      parsed:  parseCommitTrailer(message),
      htmlUrl: c.html_url || null,
    };
  });
}
