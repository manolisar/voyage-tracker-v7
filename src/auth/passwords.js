// PIN hashing — PBKDF2-SHA256.
// We hash even though PINs are 4 digits because the file is in a private repo
// (so brute-force needs repo access in the first place) and rotation is cheap.

import { PIN_PBKDF2_ITER, PIN_HASH_BYTES, PIN_SALT_BYTES } from '../domain/constants';
import { randomBytes, bytesToBase64, base64ToBytes, timingSafeEqual } from './crypto';

const enc = new TextEncoder();

async function pbkdf2(pin, salt, iter, bytes) {
  const km = await crypto.subtle.importKey(
    'raw',
    enc.encode(String(pin)),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    km,
    bytes * 8,
  );
}

// Create a fresh hash record for a new PIN.
// Returns { salt, hash, iter } — all base64 / number, ready for auth.json.
export async function hashPin(pin) {
  const salt = randomBytes(PIN_SALT_BYTES);
  const hashBuf = await pbkdf2(pin, salt, PIN_PBKDF2_ITER, PIN_HASH_BYTES);
  return {
    salt: bytesToBase64(salt),
    hash: bytesToBase64(hashBuf),
    iter: PIN_PBKDF2_ITER,
  };
}

// Verify a PIN attempt against a stored record.
export async function verifyPin(pin, record) {
  if (!record?.salt || !record?.hash || !record?.iter) return false;
  const salt = base64ToBytes(record.salt);
  const expected = base64ToBytes(record.hash);
  const got = await pbkdf2(pin, salt, record.iter, expected.byteLength);
  return timingSafeEqual(new Uint8Array(got), expected);
}
