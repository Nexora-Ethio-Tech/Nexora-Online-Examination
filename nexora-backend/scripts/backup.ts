import { spawn } from 'child_process';
import { readFile, writeFile, stat } from 'fs/promises';
import { resolve } from 'path';
import { Pool } from 'pg';
import { loadBackendEnvironment } from '../src/common/db/database-config';
import {
  decryptBackup,
  encryptBackup,
  MAX_BACKUP_BYTES,
} from '../src/common/crypto/backup-envelope';

loadBackendEnvironment();

function connection(value: string | undefined) {
  const url = new URL(value ?? '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !url.pathname)
    throw new Error('A PostgreSQL connection is required');
  if (url.port === '6543') throw new Error('Use a direct or session-pooler connection');
  // Keep credentials out of command arguments and child error output.
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGSSLMODE: 'verify-full',
    PGSSLROOTCERT: process.env.BACKUP_CA_FILE || 'system',
    PGCONNECT_TIMEOUT: '15',
  };
}

async function postgresTool(
  tool: 'pg_dump' | 'pg_restore',
  args: string[],
  url: string | undefined,
  input?: Buffer,
) {
  return new Promise<Buffer>((done, fail) => {
    const child = spawn(tool, args, {
      env: connection(url),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BACKUP_BYTES) {
        tooLarge = true;
        child.kill();
      } else chunks.push(chunk);
    });
    // Provider errors can contain connection details. Do not echo them.
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.once('error', () =>
      fail(new Error(`${tool} could not start; install PostgreSQL client tools`)),
    );
    child.once('close', (code) => {
      if (tooLarge || code !== 0)
        fail(new Error(`${tool} failed; no successful backup/restore is claimed`));
      else done(Buffer.concat(chunks));
    });
    child.stdin.end(input);
  });
}

async function main() {
  const [command, filename, confirmation, ...extra] = process.argv.slice(2);
  if (!filename || extra.length || !['backup', 'restore'].includes(command))
    throw new Error('Use db:backup -- <new-file> or db:restore -- <file> --confirm-empty-target');
  const file = resolve(filename);
  const encodedKey = process.env.BACKUP_ENCRYPTION_KEY;
  // Validate key before database work.
  encryptBackup(Buffer.from('validation'), encodedKey);
  if (command === 'backup') {
    if (confirmation) throw new Error('Unexpected argument');
    const archive = await postgresTool(
      'pg_dump',
      ['--format=custom', '--schema=public', '--no-password'],
      process.env.MIGRATION_DATABASE_URL,
    );
    await writeFile(file, encryptBackup(archive, encodedKey), { flag: 'wx', mode: 0o600 });
    process.stdout.write(
      'Encrypted application-schema backup created. Restore rehearsal is still required.\n',
    );
    return;
  }
  if (confirmation !== '--confirm-empty-target')
    throw new Error(
      'Restore requires --confirm-empty-target and a dedicated empty restore database',
    );
  const target = process.env.RESTORE_DATABASE_URL;
  if (!target) throw new Error('RESTORE_DATABASE_URL is required; production is never the default');
  const targetConnection = connection(target);
  for (const source of [process.env.DATABASE_URL, process.env.MIGRATION_DATABASE_URL]) {
    if (!source) continue;
    const current = connection(source);
    if (
      current.PGHOST === targetConnection.PGHOST &&
      current.PGPORT === targetConnection.PGPORT &&
      current.PGDATABASE === targetConnection.PGDATABASE &&
      current.PGUSER === targetConnection.PGUSER
    )
      throw new Error('Restore target matches a configured application connection');
  }
  if ((await stat(file)).size > MAX_BACKUP_BYTES + 128)
    throw new Error('Backup exceeds the supported archive size');
  const archive = decryptBackup(await readFile(file), encodedKey);
  const ca = process.env.BACKUP_CA_FILE
    ? await readFile(process.env.BACKUP_CA_FILE, 'utf8')
    : undefined;
  const pool = new Pool({
    host: targetConnection.PGHOST,
    port: Number(targetConnection.PGPORT),
    user: targetConnection.PGUSER,
    password: targetConnection.PGPASSWORD,
    database: targetConnection.PGDATABASE,
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    max: 1,
    connectionTimeoutMillis: 15000,
  });
  try {
    const occupied = await pool.query(
      `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')
       AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=c.oid AND d.deptype='e')
       LIMIT 1`,
    );
    if (occupied.rows.length) throw new Error('Restore target public schema is not empty');
  } finally {
    await pool.end();
  }
  await postgresTool(
    'pg_restore',
    [
      '--dbname',
      targetConnection.PGDATABASE,
      '--single-transaction',
      '--exit-on-error',
      '--no-owner',
      '--no-password',
    ],
    target,
    archive,
  );
  process.stdout.write(
    'Archive restored transactionally. Verify counts, RLS, receipts and application keys before use.\n',
  );
}

main().catch(() => {
  process.stderr.write(
    'Backup/restore failed. Check arguments, dedicated encryption key, verified TLS, client tools and isolated empty target. No success is claimed.\n',
  );
  process.exitCode = 1;
});
