import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { databasePoolConfig, loadBackendEnvironment } from '../src/common/db/database-config';

loadBackendEnvironment();
const logger = new Logger('migrate');

async function runMigrations() {
  const pool = new Pool(databasePoolConfig('migration'));

  const client = await pool.connect();

  try {
    logger.log('[Migrate] Connecting to database...');
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('nexora:migrations', 0))");
    await client.query(`SET LOCAL app.is_migration_or_admin = 'true';`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const migrationsDir = path.resolve(__dirname, '../migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const appliedRes = await client.query(`SELECT version FROM schema_migrations`);
    const appliedSet = new Set(appliedRes.rows.map((r) => r.version));

    for (const file of files) {
      if (appliedSet.has(file)) {
        logger.log(`[Migrate] Skipping already applied: ${file}`);
        continue;
      }

      logger.log(`[Migrate] Applying migration: ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (version) VALUES ($1)`, [file]);
      logger.log(`[Migrate] Applied: ${file}`);
    }

    await client.query('COMMIT');
    logger.log('[Migrate] All migrations applied successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('[Migrate] Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
