import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { localTestSettings } from './local-test-config.ts';

const report = (...values: unknown[]) => process.stdout.write(values.join(' ') + '\n');
const root = resolve(import.meta.dirname, '..');
const requireBackend = createRequire(resolve(root, 'nexora-backend/package.json'));
const { Pool } = requireBackend('pg');
const { parse } = requireBackend('dotenv');
const settings = localTestSettings(
  JSON.parse(readFileSync(resolve(root, '../.local-test/config.json'), 'utf8')),
  false,
);
const provider = { ...parse(readFileSync(resolve(root, 'nexora-backend/.env'))), ...settings };
const pool = new Pool({
  connectionString: settings.MIGRATION_DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
let failed = false;
try {
  const identity = await pool.query('SELECT current_database() name');
  report('Database:', identity.rows[0].name);
  const ledger = await pool.query('SELECT version FROM schema_migrations');
  const applied = new Set(ledger.rows.map((r: { version: string }) => r.version));
  const missing = readdirSync(resolve(root, 'nexora-backend/migrations')).filter(
    (f) => f.endsWith('.sql') && !applied.has(f),
  );
  report('Pending migrations:', missing.length ? missing.join(', ') : 'none');
  failed ||= missing.length > 0;
  const discovery = await pool.query(
    "SELECT to_regprocedure('public.nexora_worker_schools(uuid)') IS NOT NULL AS ready",
  );
  report(
    'Automatic worker discovery:',
    discovery.rows[0].ready ? 'available' : 'migration required',
  );
  failed ||= !discovery.rows[0].ready;
  for (const name of ['GROQ', 'GEMINI'])
    report(
      `${name}:`,
      provider[`${name}_API_KEY`]
        ? 'key configured (not a provider connectivity test)'
        : 'key missing',
    );
  for (const [label, url, expected] of [
    ['School API', 'http://127.0.0.1:3100/api/v1/auth/me', 401],
    ['Owner API', 'http://127.0.0.1:3101/api/v1/auth/me', 401],
    ['Frontend', 'http://127.0.0.1:5183/login', 200],
    ['Frontend API proxy', 'http://127.0.0.1:5183/api/v1/auth/me', 401],
  ] as const) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const json = response.headers.get('content-type')?.includes('application/json');
      const ok = response.status === expected && (label === 'Frontend' || json);
      report(`${label}: HTTP ${response.status}${ok ? ' OK' : ' unexpected response'}`);
      failed ||= !ok;
    } catch {
      report(`${label}: unavailable`);
      failed = true;
    }
  }
} catch {
  report('Local database checks failed. Start PostgreSQL and apply local migrations.');
  failed = true;
} finally {
  await pool.end();
}
process.exitCode = failed ? 1 : 0;
