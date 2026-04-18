/**
 * AES-256-GCM encrypt/decrypt for storing calendar source credentials.
 * Key comes from ENCRYPTION_KEY env var (32+ byte hex string).
 * Losing the key means all stored credentials must be re-entered.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { config } from './config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;   // 96-bit IV — recommended for GCM
const TAG_BYTES = 16;  // 128-bit auth tag — GCM default

function getKey(): Buffer {
  // ENCRYPTION_KEY is a hex string; convert to raw bytes
  return Buffer.from(config.ENCRYPTION_KEY, 'hex');
}

/**
 * Encrypt a plaintext string.
 * Returns a base64-encoded string: iv (12 bytes) + tag (16 bytes) + ciphertext
 */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const key = getKey();
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * Decrypt a value produced by encrypt().
 * Returns the original plaintext string.
 */
export function decrypt(ciphertext: string): string {
  const buf = Buffer.from(ciphertext, 'base64');
  const iv  = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const enc = buf.subarray(IV_BYTES + TAG_BYTES);

  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(enc),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Encrypt a plain object to a JSON string, then encrypt the JSON.
 */
export function encryptJson(value: unknown): string {
  return encrypt(JSON.stringify(value));
}

/**
 * Decrypt a value produced by encryptJson() and parse it back to an object.
 */
export function decryptJson<T>(ciphertext: string): T {
  return JSON.parse(decrypt(ciphertext)) as T;
}
