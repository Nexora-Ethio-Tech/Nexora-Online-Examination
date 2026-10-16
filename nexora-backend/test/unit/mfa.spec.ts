import { randomBytes } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  decryptMfaSecret,
  encryptMfaSecret,
  matchingTotpStep,
  mfaEncryptionKey,
  newMfaSecret,
  totpCode,
} from '../../src/common/crypto/mfa';

describe('Admin MFA cryptography', () => {
  const previous = process.env.MFA_ENCRYPTION_KEY;
  const identity = { schoolId: 'school-a', userId: 'admin-a', version: 'version-a' };
  const rfcSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  beforeAll(() => {
    process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString('base64url');
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.MFA_ENCRYPTION_KEY;
    else process.env.MFA_ENCRYPTION_KEY = previous;
  });

  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ])(
    'matches the RFC 6238 SHA1 vector at %i seconds, reduced to six digits',
    (seconds, expected) => {
      expect(totpCode(rfcSecret, Math.floor(Number(seconds) / 30))).toBe(expected);
    },
  );

  it('generates independent 20-byte base32 secrets', () => {
    const first = newMfaSecret();
    expect(first).toMatch(/^[A-Z2-7]{32}$/);
    expect(newMfaSecret()).not.toBe(first);
  });

  it('accepts only the current and adjacent steps', () => {
    const step = 60000000;
    const time = new Date(step * 30000);
    for (const offset of [-1, 0, 1])
      expect(matchingTotpStep(rfcSecret, totpCode(rfcSecret, step + offset), time)).toBe(
        step + offset,
      );
    for (const offset of [-2, 2])
      expect(matchingTotpStep(rfcSecret, totpCode(rfcSecret, step + offset), time)).toBeUndefined();
    for (const malformed of ['12345', '1234567', 'abcdef', ' 123456'])
      expect(matchingTotpStep(rfcSecret, malformed, time)).toBeUndefined();
  });

  it('encrypts with a fresh nonce and binds the ciphertext to school, administrator and version', () => {
    const encrypted = encryptMfaSecret(rfcSecret, identity);
    expect(encrypted).not.toContain(rfcSecret);
    expect(encryptMfaSecret(rfcSecret, identity)).not.toBe(encrypted);
    expect(decryptMfaSecret(encrypted, identity)).toBe(rfcSecret);
    for (const changed of [
      { ...identity, schoolId: 'school-b' },
      { ...identity, userId: 'admin-b' },
      { ...identity, version: 'version-b' },
    ]) {
      expect(() => decryptMfaSecret(encrypted, changed)).toThrow();
    }
    expect(() => decryptMfaSecret(rfcSecret, identity)).toThrow();
    expect(() => decryptMfaSecret(`${encrypted}.extra`, identity)).toThrow();
    const parts = encrypted.split('.');
    parts[2] = Buffer.alloc(32).toString('base64url');
    expect(() => decryptMfaSecret(parts.join('.'), identity)).toThrow();
  });

  it('fails closed for absent, short or noncanonical encryption keys', () => {
    const configured = process.env.MFA_ENCRYPTION_KEY;
    try {
      for (const value of ['', 'short', `${randomBytes(32).toString('base64url')}=`]) {
        process.env.MFA_ENCRYPTION_KEY = value;
        expect(() => mfaEncryptionKey()).toThrow('MFA_ENCRYPTION_KEY');
      }
    } finally {
      process.env.MFA_ENCRYPTION_KEY = configured;
    }
  });
});
