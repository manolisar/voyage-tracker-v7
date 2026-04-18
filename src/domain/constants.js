// Constants that don't depend on ship class.
// Per-class data (equipment, fuels, densities, phase templates) lives in
// public/ship-classes/<classId>.json — see src/domain/shipClass.js.

export const APP_VERSION = '7.0.0';
export const AUTO_SAVE_DELAY_MS = 1500;

// Idle / inactivity policy
export const EDIT_SESSION_MS = 30 * 60 * 1000;       // 30 min editor session
export const INACTIVITY_LOCK_MS = 15 * 60 * 1000;    // 15 min idle -> lock
export const INACTIVITY_WARN_MS = 14 * 60 * 1000;    // 14 min -> warn

// Editor roles (recorded in commit trailer; not enforced as permissions)
export const EDITOR_ROLES = {
  CHIEF:  'chief',
  SECOND: 'second',
  BRIDGE: 'bridge',
  OTHER:  'other',
};

export const EDITOR_ROLE_LABELS = {
  [EDITOR_ROLES.CHIEF]:  'Chief Engineer',
  [EDITOR_ROLES.SECOND]: '2nd Engineer (ECR)',
  [EDITOR_ROLES.BRIDGE]: 'Bridge Officer of Watch',
  [EDITOR_ROLES.OTHER]:  'Other',
};

export const PHASE_TYPES = {
  PORT:    'port',
  SEA:     'sea',
  STANDBY: 'standby',
};

// Report types live on a leg
export const REPORT_TYPES = {
  DEPARTURE: 'departure',
  ARRIVAL:   'arrival',
};

// PBKDF2 params for PIN hashing (auth/passwords.js)
export const PIN_PBKDF2_ITER = 310000;
export const PIN_HASH_BYTES = 32;
export const PIN_SALT_BYTES = 16;
