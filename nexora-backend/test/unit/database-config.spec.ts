import { describe, expect, it } from 'vitest';
import { backendEnvPath, databasePoolConfig } from '../../src/common/db/database-config';

const supabaseUrl =
  'postgresql://postgres.example:synthetic-password@aws-0-example.pooler.supabase.com:5432/postgres';

describe('Persistent database configuration', () => {
  it('loads the backend environment independently of the command working directory', () => {
    expect(backendEnvPath).toMatch(/nexora-backend[/\\]\.env$/);
  });

  it('refuses a missing runtime URL instead of silently using localhost', () => {
    expect(() => databasePoolConfig('runtime', {})).toThrow('DATABASE_URL is required');
  });

  it('requires the migration connection explicitly rather than using runtime credentials', () => {
    expect(() => databasePoolConfig('migration', { DATABASE_URL: supabaseUrl })).toThrow(
      'MIGRATION_DATABASE_URL is required',
    );
  });

  it('uses independently configured runtime and migration connections', () => {
    const migrationUrl = supabaseUrl.replace('postgres.example', 'migration.example');
    const environment = {
      DATABASE_URL: supabaseUrl,
      MIGRATION_DATABASE_URL: migrationUrl,
      DB_POOL_MAX: '7',
    };
    expect(databasePoolConfig('runtime', environment)).toMatchObject({
      connectionString: supabaseUrl,
      max: 7,
    });
    expect(databasePoolConfig('migration', environment)).toMatchObject({
      connectionString: migrationUrl,
      max: 1,
    });
  });

  it.each(['https://example.supabase.co', 'publishable-key', 'postgresql:///database'])(
    'rejects non-database configuration %s without exposing it',
    (value) => {
      const configure = () => databasePoolConfig('runtime', { DATABASE_URL: value });
      expect(configure).toThrow(/^DATABASE_URL/);
      expect(configure).not.toThrow(value);
    },
  );

  it('rejects transaction pooling for the persistent backend and migrations', () => {
    const url = supabaseUrl.replace(':5432/', ':6543/');
    expect(() => databasePoolConfig('runtime', { DATABASE_URL: url })).toThrow('Session pooler');
    expect(() => databasePoolConfig('migration', { MIGRATION_DATABASE_URL: url })).toThrow(
      'Session pooler',
    );
  });

  it.each(['0', '-1', '1.5', 'abc', ''])('rejects invalid pool size %j', (value) => {
    expect(() =>
      databasePoolConfig('runtime', { DATABASE_URL: supabaseUrl, DB_POOL_MAX: value }),
    ).toThrow('DB_POOL_MAX');
  });

  it('allows an explicitly selected isolated test database without a hidden fallback', () => {
    const url = 'postgresql://postgres@127.0.0.1:55439/nexora_be02a_test';
    expect(databasePoolConfig('runtime', { DATABASE_URL: url })).toMatchObject({
      connectionString: url,
      max: 5,
    });
    expect(databasePoolConfig('runtime', { DATABASE_URL: url }).ssl).toBeUndefined();
  });
});
