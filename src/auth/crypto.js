// Thin wrappers over WebCrypto used by the auth layer.
// All bytes shuttled across the trust boundary (auth.json) are base64.

const enc = new TextEncoder();

export function bytesToBase64(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.byteLength; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

// Derive a CryptoKey from a passphrase (used for AES-GCM token vaults later).
export async function deriveKey(passphrase, salt, iter, length = 256) {
  const km = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    km,
    { name: 'AES-GCM', length },
    false,
    ['encrypt', 'decrypt'],
  );
}

// Constant-time-ish byte compare (best-effort; JS in browser).
export function timingSafeEqual(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  const av = a instanceof Uint8Array ? a : new Uint8Array(a);
  const bv = b instanceof Uint8Array ? b : new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.byteLength; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}
