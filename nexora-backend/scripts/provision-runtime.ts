import { Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { readFile, writeFile, rename, unlink } from 'fs/promises';
import { Pool } from 'pg';
import {
  backendEnvPath,
  databasePoolConfig,
  loadBackendEnvironment,
} from '../src/common/db/database-config';

loadBackendEnvironment();
const logger = new Logger('provision-runtime');

async function main() {
  const configuration = databasePoolConfig('migration');
  if (!configuration.connectionString) throw new Error('Migration connection is required');
  const migrationUrl = new URL(configuration.connectionString);
  if (!/(^|\.)supabase\.(com|co)$/.test(migrationUrl.hostname)) {
    throw new Error('Runtime provisioning requires the configured Supabase database');
  }
  const original = await readFile(backendEnvPath, 'utf8');
  if (!/^DATABASE_URL=.+$/m.test(original)) {
    throw new Error('Set DATABASE_URL on one line in the backend .env before provisioning');
  }
  const pool = new Pool(configuration);
  const temporary = `${backendEnvPath}.runtime.tmp`;
  let replacedEnvironment = false;
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('nexora:runtime-provision', 0))",
      );
      const roles = await client.query<{ rolcanlogin: boolean }>(
        "SELECT rolcanlogin FROM pg_roles WHERE rolname = 'nexora_runtime'",
      );
      const role = roles.rows[0];
      if (!role) throw new Error('Apply migration 006 before provisioning');
      if (role.rolcanlogin) {
        throw new Error(
          'Runtime login already provisioned; this command does not rotate credentials',
        );
      }
      const password = randomBytes(32).toString('base64url');
      const username = decodeURIComponent(migrationUrl.username);
      const separator = username.indexOf('.');
      migrationUrl.username = `nexora_runtime${separator < 0 ? '' : username.slice(separator)}`;
      migrationUrl.password = password;
      const updated = original.replace(
        /^DATABASE_URL=.+$/m,
        () => `DATABASE_URL="${migrationUrl.href}"`,
      );
      const statement = await client.query<{ sql: string }>(
        "SELECT format('ALTER ROLE nexora_runtime LOGIN PASSWORD %L', $1::text) AS sql",
        [password],
      );
      const sql = statement.rows[0]?.sql;
      if (!sql) throw new Error('Cannot prepare runtime credential');
      await writeFile(temporary, updated, { mode: 0o600, flag: 'wx' });
      await client.query(sql);
      await rename(temporary, backendEnvPath);
      replacedEnvironment = true;
      await client.query('COMMIT');
      logger.log(
        'Restricted runtime login provisioned; DATABASE_URL saved privately in backend .env.',
      );
      logger.log('MIGRATION_DATABASE_URL is unchanged. Run db:status and verify tenant isolation.');
    } catch (error) {
      await client.query('ROLLBACK');
      if (replacedEnvironment) {
        await writeFile(backendEnvPath, original, { mode: 0o600 });
      }
      await unlink(temporary).catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  logger.error(
    'Runtime provisioning failed. Check connectivity, migration 006 and provisioning state.',
  );
  process.exitCode = 1;
});
