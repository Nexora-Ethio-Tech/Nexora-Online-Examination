import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const MFA_WINDOW_MS = 5 * 60 * 1000;
export const MFA_MAX_FAILURES = 5;
export type MfaIdentity = { schoolId: string; userId: string; version: string };

export function mfaEncryptionKey(): Buffer {
  const encoded = process.env.MFA_ENCRYPTION_KEY ?? '';
  const key = Buffer.from(encoded, 'base64url');
  if (key.length !== 32 || key.toString('base64url') !== encoded) {
    throw new Error('MFA_ENCRYPTION_KEY must be a private 32-byte unpadded base64url key.');
  }
  return key;
}

function aad(identity: MfaIdentity): Buffer {
  return Buffer.from(`${identity.schoolId}:${identity.userId}:${identity.version}`, 'utf8');
}

export function newMfaSecret(): string {
  const bytes = randomBytes(20);
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += alphabet[(value >>> bits) & 31];
    }
  }
  return output;
}

function secretBytes(secret: string): Buffer {
  if (!/^[A-Z2-7]{32}$/.test(secret)) throw new Error('Invalid MFA secret');
  const output: number[] = [];
  let bits = 0;
  let value = 0;
  for (const character of secret) {
    value = (value << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((value >>> bits) & 255);
    }
  }
  return Buffer.from(output);
}

export function encryptMfaSecret(
  secret: string,
  identity: MfaIdentity,
  key = mfaEncryptionKey(),
): string {
  secretBytes(secret);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aad(identity));
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `v1.${nonce.toString('base64url')}.${encrypted.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
}

export function decryptMfaSecret(
  envelope: string,
  identity: MfaIdentity,
  key = mfaEncryptionKey(),
): string {
  const [version, nonce, encrypted, tag, extra] = envelope.split('.');
  if (version !== 'v1' || !nonce || !encrypted || !tag || extra !== undefined) {
    throw new Error('Invalid encrypted MFA secret');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64url'));
  decipher.setAAD(aad(identity));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const secret = Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
  secretBytes(secret);
  return secret;
}

export function totpCode(secret: string, step: number): string {
  if (!Number.isSafeInteger(step) || step < 0) throw new Error('Invalid TOTP step');
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', secretBytes(secret)).update(counter).digest();
  const offset = digest.readUInt8(digest.length - 1) & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}

export function matchingTotpStep(secret: string, code: string, now: Date): number | undefined {
  if (!/^\d{6}$/.test(code)) return undefined;
  const step = Math.floor(now.getTime() / 30000);
  for (const candidate of [step, step - 1, step + 1]) {
    if (
      candidate >= 0 &&
      timingSafeEqual(Buffer.from(totpCode(secret, candidate)), Buffer.from(code))
    )
      return candidate;
  }
  return undefined;
}
