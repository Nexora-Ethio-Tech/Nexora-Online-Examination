import { afterEach, it, expect } from 'vitest';
import { randomBytes } from 'crypto';
import { wrapPackageKey, unwrapPackageKey } from '../../src/common/crypto/package-key';
const original = process.env.MFA_ENCRYPTION_KEY;
afterEach(() => {
  if (original === undefined) delete process.env.MFA_ENCRYPTION_KEY;
  else process.env.MFA_ENCRYPTION_KEY = original;
});
it('wraps release keys with tenant/version binding and rejects tampering', () => {
  process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString('base64url');
  const key = randomBytes(32).toString('base64url'),
    wrapped = wrapPackageKey(key, 'school', 'version');
  expect(wrapped).not.toContain(key);
  expect(unwrapPackageKey(wrapped, 'school', 'version')).toBe(key);
  expect(() => unwrapPackageKey(wrapped, 'other', 'version')).toThrow();
  expect(() => unwrapPackageKey(wrapped, 'school', 'other')).toThrow();
  const parts = wrapped.split('.');
  parts[2] = randomBytes(32).toString('base64url');
  expect(() => unwrapPackageKey(parts.join('.'), 'school', 'version')).toThrow();
});
it('reads legacy keys but refuses malformed key material', () => {
  const key = randomBytes(32).toString('base64url');
  expect(unwrapPackageKey(key, 'school', 'version')).toBe(key);
  expect(() => wrapPackageKey('invalid', 'school', 'version')).toThrow();
  expect(() => unwrapPackageKey('invalid', 'school', 'version')).toThrow();
});
