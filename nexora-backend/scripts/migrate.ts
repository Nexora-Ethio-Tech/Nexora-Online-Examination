import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString =
  process.env.MIGRATION_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/nexora_exam';

const isRemote =
  connectionString.includes('supabase.com') ||
  connectionString.includes('supabase.co') ||
  connectionString.includes('sslmode=require');

async function runMigrations() {
  const pool = new Pool({
    connectionString,
    ssl: isRemote ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10000,
  });

  const client = await pool.connect();

  try {
    console.log('[Migrate] Connecting to database...');
    await client.query('BEGIN');
    await client.query(`SET app.is_migration_or_admin = 'true';`);

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
        console.log(`[Migrate] Skipping already applied: ${file}`);
        continue;
      }

      console.log(`[Migrate] Applying migration: ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (version) VALUES ($1)`, [file]);
      console.log(`[Migrate] Applied: ${file}`);
    }

    await client.query('COMMIT');
    console.log('[Migrate] All migrations applied successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Migrate] Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
