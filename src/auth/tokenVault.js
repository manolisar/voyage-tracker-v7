// Token vault — encrypts a GitHub PAT under a passphrase using AES-GCM.
// Used in two ways:
//   1. SEED-TIME: admin tool encrypts the data-repo PAT under a passphrase
//      and writes the envelope to data/_config/auth.json (per-ship or admin).
//   2. RUNTIME: Admin Panel pastes their PAT directly. The vault is the
//      fallback when sharing a single PAT across multiple devices via the
//      auth.json envelope.
//
// All bytes shuttled to disk are base64.

import { deriveKey, randomBytes, bytesToBase64, base64ToBytes } from './crypto';

const PBKDF2_ITER = 310000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

// Envelope shape: { iter, salt, iv, ct } — all base64 strings + iter number.
export async function sealToken(token, passphrase) {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(passphrase, salt, PBKDF2_ITER);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(token),
  );
  return {
    iter: PBKDF2_ITER,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(ct),
  };
}

export async function openToken(envelope, passphrase) {
  if (!envelope?.salt || !envelope?.iv || !envelope?.ct) {
    throw new Error('Invalid token envelope');
  }
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const ct = base64ToBytes(envelope.ct);
  const key = await deriveKey(passphrase, salt, envelope.iter || PBKDF2_ITER);
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch {
    // Tampered or wrong passphrase — never leak which.
    throw new Error('Cannot decrypt token (wrong passphrase or corrupted envelope)');
  }
}
