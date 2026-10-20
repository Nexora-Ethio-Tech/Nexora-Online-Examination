import { randomBytes } from 'crypto';
import { describe, expect, it } from 'vitest';
import { decryptBackup, encryptBackup } from '../../src/common/crypto/backup-envelope';

describe('independent backup encryption', () => {
  const key = randomBytes(32).toString('base64url');
  it('round-trips binary archives with independent nonces', () => {
    const input = Buffer.concat([Buffer.from('PGDMP'), randomBytes(1000)]);
    const first = encryptBackup(input, key);
    expect(encryptBackup(input, key)).not.toEqual(first);
    expect(decryptBackup(first, key)).toEqual(input);
  });
  it('refuses missing keys rather than using MFA keys or a built-in fallback', () => {
    for (const invalid of [undefined, '', 'password', randomBytes(16).toString('base64url')])
      expect(() => encryptBackup(Buffer.from('archive'), invalid)).toThrow();
  });
  it('rejects wrong keys, changed headers, ciphertext, tags and truncated files', () => {
    const encrypted = encryptBackup(Buffer.from('private student records'), key);
    expect(() => decryptBackup(encrypted, randomBytes(32).toString('base64url'))).toThrow();
    for (const position of [0, 17, 30, encrypted.length - 1]) {
      const changed = Buffer.from(encrypted);
      changed[position] ^= 1;
      expect(() => decryptBackup(changed, key)).toThrow();
    }
    expect(() => decryptBackup(encrypted.subarray(0, -1), key)).toThrow();
  });
});
