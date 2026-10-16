import { Logger } from '@nestjs/common';
import { readdir } from 'fs/promises';
import * as path from 'path';
import { Pool } from 'pg';
import { databasePoolConfig, loadBackendEnvironment } from '../src/common/db/database-config';

loadBackendEnvironment();
const logger = new Logger('database-status');

async function inspect(mode: 'runtime' | 'migration') {
  const configuration = databasePoolConfig(mode);
  const pool = new Pool(configuration);
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      const role = await client.query<{ database: string; superuser: boolean; bypassrls: boolean }>(
        `SELECT current_database() AS database, rolsuper AS superuser, rolbypassrls AS bypassrls
         FROM pg_roles WHERE rolname = current_user`,
      );
      const tables = await client.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE' ORDER BY table_name`,
      );
      const ledger = tables.rows.some((table) => table.table_name === 'schema_migrations');
      const applied = ledger
        ? await client.query<{ version: string }>(
            'SELECT version FROM public.schema_migrations ORDER BY version',
          )
        : { rows: [] };
      const files = (await readdir(path.resolve(__dirname, '../migrations')))
        .filter((file) => file.endsWith('.sql'))
        .sort();
      const recorded = new Set(applied.rows.map((row) => row.version));
      logger.log(
        JSON.stringify(
          {
            connection: mode,
            connected: true,
            ...role.rows[0],
            tables: tables.rows.map((row) => row.table_name),
            appliedMigrations: [...recorded],
            pendingMigrations: files.filter((file) => !recorded.has(file)),
          },
          null,
          2,
        ),
      );
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  } finally {
    await pool.end();
  }
}

async function main() {
  await inspect('runtime');
  await inspect('migration');
}

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : 'Database status check failed');
  process.exitCode = 1;
});
