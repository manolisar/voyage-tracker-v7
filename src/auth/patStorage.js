// Tiny session-scoped PAT mirror.
//
// AuthProvider holds the PAT in memory. If the user opts in to "remember for
// this browser tab", we ALSO mirror it to sessionStorage so a tab refresh
// doesn't kick them out mid-edit. Storage scope = current tab; closing the
// tab clears it. We never use localStorage.

const REMEMBER_KEY = 'vt7.pat';

export function readRememberedPat() {
  try { return sessionStorage.getItem(REMEMBER_KEY) || null; }
  catch { return null; }
}

export function writeRememberedPat(pat) {
  try {
    if (pat) sessionStorage.setItem(REMEMBER_KEY, pat);
    else     sessionStorage.removeItem(REMEMBER_KEY);
  } catch { /* sessionStorage unavailable — ignore */ }
}

export function clearRememberedPat() {
  try { sessionStorage.removeItem(REMEMBER_KEY); } catch { /* ignore */ }
}
