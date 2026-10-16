import * as crypto from 'crypto';

export interface EncryptedPackageResult {
  algorithm: 'AES-GCM';
  iv: string; // base64url
  ciphertext: string; // base64url (ciphertext + 16-byte auth tag)
  sha256: string; // lowercase hex of combined ciphertext+tag buffer
  keyBase64url: string; // 32-byte key in base64url format
}

/**
 * Encrypts an exam package payload with AES-256-GCM according to the Nexora specification.
 */
export function encryptExamPackage(payload: unknown, customKey?: Buffer): EncryptedPackageResult {
  const jsonStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const key = customKey || crypto.randomBytes(32);
  const iv = crypto.randomBytes(12); // 12-byte nonce

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(jsonStr, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes (128-bit)

  const combined = Buffer.concat([ciphertext, authTag]);
  const sha256 = crypto.createHash('sha256').update(combined).digest('hex').toLowerCase();

  return {
    algorithm: 'AES-GCM',
    iv: iv.toString('base64url'),
    ciphertext: combined.toString('base64url'),
    sha256,
    keyBase64url: key.toString('base64url'),
  };
}

/**
 * Decrypts an exam package payload from base64url strings.
 */
export function decryptExamPackage<T = unknown>(
  ciphertextBase64url: string,
  ivBase64url: string,
  keyBase64url: string,
): T {
  const combined = Buffer.from(ciphertextBase64url, 'base64url');
  const iv = Buffer.from(ivBase64url, 'base64url');
  const key = Buffer.from(keyBase64url, 'base64url');

  if (combined.length < 16) {
    throw new Error('Invalid ciphertext: buffer too short for auth tag');
  }

  const ciphertext = combined.subarray(0, combined.length - 16);
  const authTag = combined.subarray(combined.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8')) as T;
}
