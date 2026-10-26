import { describe, expect, it } from 'vitest';
import { platformPoolConfig } from '../../src/platform/platform-db';
const url =
  'postgresql://nexora_platform:synthetic-password@db.example.test:5432/nexora?sslmode=require';
describe('isolated platform runtime configuration', () => {
  it('does not fall back to the school database', () => {
    expect(() => platformPoolConfig({ NODE_ENV: 'test', DATABASE_URL: url })).toThrow(
      'PLATFORM_DATABASE_URL',
    );
  });
  it.each(['MIGRATION_DATABASE_URL', 'DATABASE_URL', 'MFA_ENCRYPTION_KEY'])(
    'rejects %s in a production platform deployment',
    (field) => {
      expect(() =>
        platformPoolConfig({
          NODE_ENV: 'production',
          PLATFORM_DATABASE_URL: url,
          [field]: 'not-allowed',
        }),
      ).toThrow('must not contain');
    },
  );
  it('requires encrypted verified transport in production', () => {
    expect(() =>
      platformPoolConfig({
        NODE_ENV: 'production',
        PLATFORM_DATABASE_URL: url.replace('?sslmode=require', ''),
      }),
    ).toThrow('verified TLS');
    expect(() =>
      platformPoolConfig({
        NODE_ENV: 'production',
        PLATFORM_DATABASE_URL: url,
        DB_SSL_REJECT_UNAUTHORIZED: 'false',
      }),
    ).toThrow('verified TLS');
    expect(
      platformPoolConfig({ NODE_ENV: 'production', PLATFORM_DATABASE_URL: url }).ssl,
    ).toMatchObject({ rejectUnauthorized: true });
  });
  it('permits an explicitly configured local test database', () => {
    expect(
      platformPoolConfig({
        NODE_ENV: 'test',
        PLATFORM_DATABASE_URL: 'postgresql://nexora_platform@localhost:5432/disposable_test',
      }).ssl,
    ).toBeUndefined();
  });
});

describe('combined backend configuration', () => {
  const env = {
    NODE_ENV: 'production',
    NEXORA_SERVICE: 'combined',
    PLATFORM_DATABASE_URL: url,
    DATABASE_URL: 'postgresql://nexora_runtime@db.example.test/db',
    MFA_ENCRYPTION_KEY: 'school-key',
    PLATFORM_MFA_ENCRYPTION_KEY: 'owner-key',
  };
  it('allows two runtime pools but never migration credentials', () => {
    expect(platformPoolConfig(env).connectionString).toContain('nexora_platform');
    expect(() => platformPoolConfig({ ...env, MIGRATION_DATABASE_URL: url })).toThrow();
  });
  it('rejects sharing the school encryption key', () => {
    expect(() => platformPoolConfig({ ...env, PLATFORM_MFA_ENCRYPTION_KEY: 'school-key' })).toThrow(
      'separate',
    );
  });
});
