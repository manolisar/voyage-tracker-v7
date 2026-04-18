// Idle timer — fires `onIdle()` after `ms` of no user input.
// Used by AuthContext to drop edit mode back to view-only after 30 min,
// and to auto-lock the admin PAT after the same window.

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'];

export function startInactivityTimer({ ms, onIdle, onWarn, warnAtMs }) {
  let idleTimer = null;
  let warnTimer = null;
  let stopped = false;

  function clear() {
    if (idleTimer) clearTimeout(idleTimer);
    if (warnTimer) clearTimeout(warnTimer);
  }

  function reset() {
    if (stopped) return;
    clear();
    if (warnAtMs && onWarn) {
      warnTimer = setTimeout(() => { if (!stopped) onWarn(); }, warnAtMs);
    }
    idleTimer = setTimeout(() => { if (!stopped) onIdle(); }, ms);
  }

  for (const evt of ACTIVITY_EVENTS) {
    window.addEventListener(evt, reset, { passive: true });
  }
  reset();

  return function stop() {
    stopped = true;
    clear();
    for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, reset);
  };
}
