import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';
import { mfaEncryptionKey } from './mfa';
function wrappingKey() {
  return Buffer.from(
    hkdfSync('sha256', mfaEncryptionKey(), Buffer.alloc(0), 'nexora-package-key-v1', 32),
  );
}
function context(school: string, version: string) {
  return Buffer.from(`nexora-package-key-v1:${school}:${version}`);
}
export function wrapPackageKey(key: string, school: string, version: string) {
  const raw = Buffer.from(key, 'base64url');
  if (raw.length !== 32 || raw.toString('base64url') !== key)
    throw new Error('Invalid package key');
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', wrappingKey(), iv);
  cipher.setAAD(context(school, version));
  const encrypted = Buffer.concat([cipher.update(raw), cipher.final()]);
  return [
    'pk1',
    iv.toString('base64url'),
    encrypted.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
  ].join('.');
}
export function unwrapPackageKey(envelope: string, school: string, version: string) {
  // Read compatibility only for packages created by the original backend. New writes always wrap.
  if (/^[A-Za-z0-9_-]{43}$/.test(envelope) && Buffer.from(envelope, 'base64url').length === 32)
    return envelope;
  const [prefix, iv, data, tag, extra] = envelope.split('.');
  if (prefix !== 'pk1' || !iv || !data || !tag || extra !== undefined)
    throw new Error('Invalid package key envelope');
  const decipher = createDecipheriv('aes-256-gcm', wrappingKey(), Buffer.from(iv, 'base64url'));
  decipher.setAAD(context(school, version));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const key = Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]);
  if (key.length !== 32) throw new Error('Invalid package key length');
  return key.toString('base64url');
}
