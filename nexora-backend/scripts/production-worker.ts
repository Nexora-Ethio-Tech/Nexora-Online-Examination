import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { parse } from 'dotenv';
import { databasePoolConfig, loadBackendEnvironment } from '../src/common/db/database-config';

const jobName = 'nexora-production-import-worker';
const schema = 'nexora_worker_ops';
let stage = 'validate configuration';

async function main() {
  const [action, origin, ...extra] = process.argv.slice(2);
  if (!['install', 'enable', 'disable', 'status'].includes(action ?? '') || extra.length % 2)
    throw new Error('Use install, enable, disable or status, followed by the backend origin.');
  // Use dotenv's parser consistently with the backend, including escaped PEM newlines.
  for (let index = 0; index < extra.length; index += 2) {
    if (extra[index] !== '--private-config') throw new Error('Unknown option.');
    Object.assign(process.env, parse(readFileSync(extra[index + 1], 'utf8')));
  }
  loadBackendEnvironment();
  const url = new URL(origin ?? '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Use the HTTPS backend origin without credentials, a path or query.');
  const endpoint = `${url.origin}/api/v1/internal/import-worker`;
  const secret = process.env.IMPORT_WORKER_SECRET;
  if (action === 'install' && (!secret || secret.length < 32))
    throw new Error('Worker secret missing.');
  stage = 'build verified database connection';
  const database = databasePoolConfig('migration');
  if (!database.ssl || typeof database.ssl !== 'object' || database.ssl.rejectUnauthorized !== true)
    throw new Error('Verified database TLS is required for production scheduling.');
  const pool = new Pool(database);
  stage = 'connect to database';
  const c = await pool.connect();
  try {
    if (action === 'install') {
      await c.query('BEGIN');
      stage = 'install scheduler extensions';
      await c.query('CREATE EXTENSION IF NOT EXISTS pg_cron');
      await c.query('CREATE EXTENSION IF NOT EXISTS pg_net');
      stage = 'restrict secret-bearing tables';
      // Supabase owns pg_net and does not support revoking its public queue grants.
      // Queue only an expiring, school-bound, single-use signature, never the bearer secret.
      await c.query('REVOKE ALL ON vault.decrypted_secrets FROM PUBLIC');
      const roles = await c.query<{ rolname: string }>(
        "SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','nexora_runtime','nexora_platform','nexora_platform_runtime')",
      );
      for (const { rolname } of roles.rows) {
        // Names are selected from the fixed list above, never supplied by an HTTP caller.
        await c.query(`REVOKE ALL ON vault.decrypted_secrets FROM "${rolname}"`);
      }
      stage = 'install dispatcher';
      await c.query(readFileSync(resolve(__dirname, 'sql/production-worker.sql'), 'utf8'));
      const existing = await c.query(`SELECT singleton FROM ${schema}.scheduler`);
      if (existing.rowCount)
        throw new Error('Scheduler already installed; use status/enable/disable.');
      stage = 'store worker credential in Vault';
      const saved = await c.query<{ id: string }>('SELECT vault.create_secret($1, $2, $3) AS id', [
        secret,
        'nexora_import_worker',
        'Private scheduled import-worker bearer credential',
      ]);
      await c.query(`INSERT INTO ${schema}.scheduler(endpoint,secret_id) VALUES($1,$2)`, [
        endpoint,
        saved.rows[0].id,
      ]);
      stage = 'verify restricted permissions';
      for (const { rolname } of roles.rows) {
        // Supabase operator default privileges can grant API roles access to new objects.
        await c.query(`REVOKE ALL ON SCHEMA ${schema} FROM "${rolname}"`);
        await c.query(`REVOKE ALL ON ALL TABLES IN SCHEMA ${schema} FROM "${rolname}"`);
        await c.query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ${schema} FROM "${rolname}"`);
        await c.query(
          `REVOKE ALL ON FUNCTION public.nexora_claim_worker_dispatch(uuid,uuid) FROM "${rolname}"`,
        );
        const permissions = await c.query<{ vault: boolean; dispatcher: boolean; state: boolean }>(
          `SELECT has_table_privilege($1,'vault.decrypted_secrets','SELECT') AS vault,
            has_function_privilege($1,'${schema}.tick()','EXECUTE') AS dispatcher,
            has_table_privilege($1,'${schema}.scheduler','SELECT,INSERT,UPDATE,DELETE') AS state`,
          [rolname],
        );
        const exposed = Object.entries(permissions.rows[0])
          .filter(([, allowed]) => allowed)
          .map(([key]) => key);
        if (exposed.length) {
          stage = `verify restricted permissions: ${rolname} still has ${exposed.join(',')} access`;
          throw new Error('Unsafe inherited scheduler permissions.');
        }
      }
      await c.query(
        'GRANT EXECUTE ON FUNCTION public.nexora_claim_worker_dispatch(uuid,uuid) TO nexora_runtime',
      );
      stage = 'register disabled dispatcher schedule';
      await c.query('SELECT cron.schedule($1, $2, $3)', [
        jobName,
        '30 seconds',
        `SELECT ${schema}.tick();`,
      ]);
      await c.query('COMMIT');
      process.stdout.write(
        'Scheduler installed DISABLED. Save the production worker secret, redeploy, then enable.\n',
      );
    } else if (action === 'enable') {
      stage = 'verify deployed worker before enabling';
      if (!secret || secret.length < 32) throw new Error('Worker secret missing.');
      // Check readiness without processing a real school. The nil UUID is not a provisioned school.
      const response = await fetch(endpoint, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ schoolId: '00000000-0000-0000-0000-000000000000' }),
      });
      if (response.status !== 200)
        throw new Error('Deployed worker authentication/readiness check failed.');
      const updated = await c.query(
        `UPDATE ${schema}.scheduler SET enabled=true WHERE endpoint=$1
        AND secret_id IN (SELECT id FROM vault.decrypted_secrets WHERE decrypted_secret=$2) RETURNING singleton`,
        [endpoint, secret],
      );
      if (updated.rowCount !== 1) throw new Error('Installed endpoint or secret does not match.');
      process.stdout.write('Automatic production processing enabled.\n');
    } else if (action === 'disable') {
      await c.query(`UPDATE ${schema}.scheduler SET enabled=false WHERE endpoint=$1`, [endpoint]);
      process.stdout.write('Future dispatches disabled; any in-flight worker may finish.\n');
    }
    const result = await c.query(
      `SELECT enabled, endpoint, checked_at, dispatched_at,
      request_id IS NOT NULL AS awaiting_response, last_http_status, last_result,
      successful_requests, failed_requests FROM ${schema}.scheduler WHERE endpoint=$1`,
      [endpoint],
    );
    process.stdout.write(JSON.stringify(result.rows, null, 2) + '\n');
  } finally {
    await c.query('ROLLBACK').catch(() => undefined);
    c.release();
    await pool.end();
  }
}
main().catch((error: unknown) => {
  const code =
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^[A-Z0-9_]{3,40}$/.test(error.code)
      ? ` (${error.code})`
      : '';
  process.stderr.write(
    `Production worker operation failed at: ${stage}${code}. No credentials were logged.\n`,
  );
  process.exitCode = 1;
});
