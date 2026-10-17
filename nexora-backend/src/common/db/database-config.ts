import { existsSync } from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import { PoolConfig } from 'pg';

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
  return {
    connectionString,
    max: mode === 'migration' ? 1 : max,
    // Release session-pooler slots before Vercel can suspend an idle instance.
    maxUses: vercelRuntime ? 1 : undefined,
    ssl:
      isSupabase || (sslMode !== null && sslMode !== 'disable')
        ? { rejectUnauthorized: false }
        : undefined,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };
}
