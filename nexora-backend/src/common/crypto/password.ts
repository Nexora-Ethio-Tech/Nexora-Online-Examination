import * as crypto from 'crypto';
import * as argon2 from 'argon2';

/**
 * Hashes a password using Argon2id with per-password salt.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
  });
}

/**
 * Verifies a password against an Argon2id hash.
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * Generates a cryptographically secure random password.
 * Uses a charset without ambiguous characters (e.g. 0, O, 1, l, I).
 */
export function generateCsprngPassword(length = 12): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz!@#$%*';
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * Generates a readable login ID using school prefix and sequence/suffix.
 * e.g., 'SCH-001' or 'SCH-4891'
 */
export function formatLoginId(prefix: string, sequenceOrSuffix: string | number): string {
  const cleanPrefix = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const seqStr = String(sequenceOrSuffix).padStart(3, '0');
  return `${cleanPrefix}-${seqStr}`;
}

/**
 * Generates an opaque CSPRNG token (e.g. for session cookies, device credentials, CSRF tokens).
 */
export function generateOpaqueToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString('base64url');
}

/**
 * Computes lowercase SHA-256 hex string.
 */
export function hashSha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex').toLowerCase();
}
