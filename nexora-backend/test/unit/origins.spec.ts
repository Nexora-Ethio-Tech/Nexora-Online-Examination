import { describe, expect, it } from 'vitest';
import { allowedOrigins } from '../../src/common/security/origins';

describe('Exact origin configuration', () => {
  it('accepts and deduplicates exact configured origins', () => {
    expect([
      ...allowedOrigins({
        NODE_ENV: 'production',
        APP_ORIGIN: 'https://exam.example',
        CORS_ORIGIN: 'https://exam.example',
      }),
    ]).toEqual(['https://exam.example']);
    expect(
      allowedOrigins({ NODE_ENV: 'production', APP_ORIGIN: 'https://exam.example:8443' }).has(
        'https://exam.example:8443',
      ),
    ).toBe(true);
  });

  it.each(['development', 'test'])('enables local defaults only in explicit %s mode', (mode) => {
    expect([...allowedOrigins({ NODE_ENV: mode })]).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
    ]);
  });

  it('does not retain local development defaults in production', () => {
    const origins = allowedOrigins({ NODE_ENV: 'production', APP_ORIGIN: 'https://exam.example' });
    for (const origin of [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
      'https://exam.example.evil.test',
      'https://exam.example:444',
      'http://exam.example',
    ])
      expect(origins.has(origin)).toBe(false);
  });

  it.each([
    '*',
    'null',
    'not-a-url',
    'https://exam.example/',
    'https://exam.example/path',
    'https://exam.example?x=1',
    'https://exam.example#fragment',
    'https://user:password@exam.example',
    'ftp://exam.example',
    'http://exam.example',
    'https://exam.example,https://other.example',
  ])('refuses unsafe/ambiguous production configuration %s without echoing it', (value) => {
    const configure = () => allowedOrigins({ NODE_ENV: 'production', APP_ORIGIN: value });
    expect(configure).toThrow(/APP_ORIGIN/);
    expect(configure).not.toThrow(value);
  });

  it('fails closed without configured origins outside explicit development/test', () => {
    expect(() => allowedOrigins({ NODE_ENV: 'production' })).toThrow('Configure APP_ORIGIN');
    expect(() => allowedOrigins({})).toThrow('Configure APP_ORIGIN');
  });
});
