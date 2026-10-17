import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import { PoolConfig } from 'pg';
import { X509Certificate } from 'crypto';

const sourceRoot = path.resolve(__dirname, '../../..');
const backendRoot = existsSync(path.join(sourceRoot, 'package.json'))
  ? sourceRoot
  : path.dirname(sourceRoot);

export const backendEnvPath = path.join(backendRoot, '.env');

export function loadBackendEnvironment(): void {
  config({ path: backendEnvPath });
}

export function databasePoolConfig(
  mode: 'runtime' | 'migration',
  environment: NodeJS.ProcessEnv = process.env,
): PoolConfig {
  const key = mode === 'runtime' ? 'DATABASE_URL' : 'MIGRATION_DATABASE_URL';
  const connectionString = environment[key]?.trim();
  if (!connectionString) {
    throw new Error(
      `${key} is required. Configure the PostgreSQL connection string in nexora-backend/.env.`,
    );
  }
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(`${key} must be a valid PostgreSQL connection URL.`);
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username) {
    throw new Error(
      `${key} must be a PostgreSQL connection URL, not a Supabase project URL or API key.`,
    );
  }
  const isSupabase = /(^|\.)supabase\.(com|co)$/.test(url.hostname);
  if (isSupabase && url.port === '6543') {
    throw new Error(`${key} must use the direct connection or Session pooler on port 5432.`);
  }
  const vercelRuntime = mode === 'runtime' && environment.VERCEL === '1';
  const max = Number(environment.DB_POOL_MAX ?? (vercelRuntime ? '1' : '5'));
  if (!Number.isSafeInteger(max) || max < 1) {
    throw new Error('DB_POOL_MAX must be a positive integer.');
  }
  const sslMode = url.searchParams.get('sslmode');
  const secureTransport = isSupabase || (sslMode !== null && sslMode !== 'disable');
  const localDevelopment =
    environment.VERCEL !== '1' && ['development', 'test'].includes(environment.NODE_ENV ?? '');
  const inlineCa = environment.DB_SSL_CA?.trim();
  const caFile = environment.DB_SSL_CA_FILE?.trim();
  if (inlineCa && caFile) {
    throw new Error('Configure only one of DB_SSL_CA or DB_SSL_CA_FILE.');
  }
  const ca = (inlineCa || (caFile ? readFileSync(caFile, 'utf8') : undefined))
    ?.replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n');
  if (ca !== undefined) {
    try {
      const pattern = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;
      const certificates = ca.match(pattern);
      if (!certificates?.length || ca.replace(pattern, '').trim()) throw new Error();
      for (const certificate of certificates) new X509Certificate(certificate);
    } catch {
      throw new Error(
        'DB_SSL_CA or DB_SSL_CA_FILE must contain a valid PEM CA certificate bundle.',
      );
    }
  }
  // pg connection-string SSL parameters otherwise replace the explicit TLS options.
  if (secureTransport)
    for (const parameter of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'])
      url.searchParams.delete(parameter);

  return {
    connectionString: secureTransport ? url.toString() : connectionString,
    max: mode === 'migration' ? 1 : max,
    // Release session-pooler slots before Vercel can suspend an idle instance.
    maxUses: vercelRuntime ? 1 : undefined,
    ssl: secureTransport
      ? { rejectUnauthorized: !localDevelopment || ca !== undefined, ...(ca ? { ca } : {}) }
      : undefined,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };
}
