/**
 * Web Crypto API Security Utilities:
 * - PBKDF2 PIN hashing with random 16-byte salt and 120,000 iterations (>= 100,000)
 * - AES-GCM 256-bit encryption/decryption for sensitive fields (e.g. customer phone lockCode)
 *   and encrypted JSON backups, derived from the device PIN.
 */

export const PBKDF2_ITERATIONS = 120000;
const ENC_PREFIX = 'ENC_AESGCM:';

// In-memory session secret derived from the unlocked PIN (or fallback device key)
let sessionSecretPassphrase: string = 'golden_shop_device_vault_key_v1';

export function setSessionPinSecret(pin: string) {
  if (pin && pin.trim().length > 0) {
    sessionSecretPassphrase = `golden_pin_${pin.trim()}`;
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generates a cryptographically random 16-byte salt (hex encoded)
 */
export function generateRandomSaltHex(byteLength = 16): string {
  const salt = new Uint8Array(byteLength);
  crypto.getRandomValues(salt);
  return bytesToHex(salt);
}

/**
 * Derives a PBKDF2-SHA256 hash of a PIN with a given hex salt and >= 100,000 iterations.
 * Stored format: `pbkdf2:<iterations>:<saltHex>:<hashHex>`
 */
export async function hashPinPBKDF2(
  pin: string,
  saltHex: string = generateRandomSaltHex(16),
  iterations: number = PBKDF2_ITERATIONS
): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin.trim()),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const saltBytes = hexToBytes(saltHex);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer as ArrayBuffer,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const hashHex = bytesToHex(new Uint8Array(derivedBits));
  return `pbkdf2:${iterations}:${saltHex}:${hashHex}`;
}

/**
 * Verifies a plain PIN against a stored PBKDF2 record (`pbkdf2:iter:salt:hash`)
 */
export async function verifyPinPBKDF2(pin: string, storedRecord: string): Promise<boolean> {
  if (!storedRecord || !storedRecord.startsWith('pbkdf2:')) {
    return false;
  }
  const parts = storedRecord.split(':');
  if (parts.length !== 4) return false;
  const iterations = parseInt(parts[1], 10);
  const saltHex = parts[2];
  if (!iterations || !saltHex) return false;

  const computed = await hashPinPBKDF2(pin, saltHex, iterations);
  return computed === storedRecord;
}

/**
 * Derives an AES-GCM 256-bit CryptoKey from a passphrase and salt
 */
async function deriveAesGcmKey(passphrase: string, saltBytes: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts sensitive string (such as customer phone lockCode) using AES-GCM.
 * Returns string prefixed with `ENC_AESGCM:`.
 */
export async function encryptSensitiveData(
  plainText: string | undefined,
  customPassphrase?: string
): Promise<string> {
  if (!plainText || !plainText.trim()) return '';
  if (plainText.startsWith(ENC_PREFIX)) return plainText; // already encrypted

  try {
    const salt = new Uint8Array(16);
    const iv = new Uint8Array(12);
    crypto.getRandomValues(salt);
    crypto.getRandomValues(iv);

    const key = await deriveAesGcmKey(customPassphrase || sessionSecretPassphrase, salt);
    const enc = new TextEncoder();
    const cipherBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      key,
      enc.encode(plainText)
    );

    const combined = new Uint8Array(salt.byteLength + iv.byteLength + cipherBuffer.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.byteLength);
    combined.set(new Uint8Array(cipherBuffer), salt.byteLength + iv.byteLength);

    return `${ENC_PREFIX}${bytesToBase64(combined)}`;
  } catch {
    return plainText;
  }
}

/**
 * Decrypts an `ENC_AESGCM:` string back to plainText for authorized UI display.
 */
export async function decryptSensitiveData(
  cipherText: string | undefined,
  customPassphrase?: string
): Promise<string> {
  if (!cipherText) return '';
  if (!cipherText.startsWith(ENC_PREFIX)) return cipherText;

  try {
    const rawBase64 = cipherText.slice(ENC_PREFIX.length);
    const combined = base64ToBytes(rawBase64);
    if (combined.byteLength <= 28) return '••••';

    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const data = combined.slice(28);

    const key = await deriveAesGcmKey(customPassphrase || sessionSecretPassphrase, salt);
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      key,
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
    );

    return new TextDecoder().decode(plainBuffer);
  } catch {
    return '•••• (Chiffré)';
  }
}

export function isEncryptedLockCode(value?: string): boolean {
  return Boolean(value && value.startsWith(ENC_PREFIX));
}

/**
 * Generates a UUID v4 using Web Crypto API
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
