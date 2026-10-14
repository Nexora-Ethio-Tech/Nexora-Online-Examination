import { describe, expect, it } from 'vitest';
import { readEnvironment } from './env';
describe('environment', () => {
  it('defaults to real same-origin API', () => {
    expect(readEnvironment({ production: false })).toEqual({ baseUrl: '/api/v1', useMocks: false });
  });
  it('rejects mocks and insecure remote APIs in production', () => {
    expect(() => readEnvironment({ production: true, useMocks: 'true' })).toThrow('Mocks');
    expect(() =>
      readEnvironment({ production: true, baseUrl: 'http://api.example.test/api/v1' }),
    ).toThrow('HTTPS');
  });
  it('rejects protocol-relative URLs', () => {
    expect(() => readEnvironment({ production: false, baseUrl: '//evil.test' })).toThrow();
  });
});
