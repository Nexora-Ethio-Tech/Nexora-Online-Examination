import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { createInterface } from 'readline/promises';
import { z } from 'zod';
import { databasePoolConfig, loadBackendEnvironment } from '../src/common/db/database-config';
import { platformKey } from '../src/platform/platform-db';
import { newMfaSecret, encryptMfaSecret, matchingTotpStep } from '../src/common/crypto/mfa';
import { generateOpaqueToken, hashPassword } from '../src/common/crypto/password';

import { showEnrollmentPage } from './owner-enrollment-page';

loadBackendEnvironment();
async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error('Use a private interactive operator terminal');
  const command = process.argv[2];
  if (!['create', 'recover', 'disable', 'provision-runtime'].includes(command ?? ''))
    throw new Error('Choose create, recover, disable or provision-runtime');
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  const pool = new Pool(databasePoolConfig('migration'));
  let removePage = () => {};
  try {
    const role = (
      await pool.query<{ allowed: boolean }>(
        'SELECT rolsuper OR rolbypassrls AS allowed FROM pg_roles WHERE rolname=current_user',
      )
    ).rows[0];
    if (!role?.allowed) throw new Error('Protected migration credentials required');
    const operator = z
      .string()
      .trim()
      .min(3)
      .max(150)
      .parse(await terminal.question('Operator identity: '));
    const reason = z
      .string()
      .trim()
      .min(5)
      .max(500)
      .parse(await terminal.question('Reason: '));
    if (
      (await terminal.question(
        'Verify owner identity and authorization through your protected support process. Type VERIFIED: ',
      )) !== 'VERIFIED'
    )
      throw new Error('Verification required');
    if (command === 'provision-runtime') {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query(
          "SELECT pg_advisory_xact_lock(hashtextextended('nexora:platform-runtime',0))",
        );
        const role = (
          await c.query<{ rolcanlogin: boolean }>(
            "SELECT rolcanlogin FROM pg_roles WHERE rolname='nexora_platform'",
          )
        ).rows[0];
        if (!role || role.rolcanlogin)
          throw new Error(
            'Apply migration 023 first; existing runtime credentials are not rotated by this command',
          );
        const password = generateOpaqueToken();
        const statement = (
          await c.query<{ sql: string }>(
            "SELECT format('ALTER ROLE nexora_platform LOGIN PASSWORD %L',$1::text) AS sql",
            [password],
          )
        ).rows[0].sql;
        await c.query(statement);
        await c.query(
          "INSERT INTO platform.audit(action,reason,details) VALUES('runtime_provisioned',$1,$2)",
          [reason, { operator }],
        );
        await c.query('COMMIT');
        const url = new URL(process.env.MIGRATION_DATABASE_URL ?? '');
        const username = decodeURIComponent(url.username),
          separator = username.indexOf('.');
        url.username = `nexora_platform${separator < 0 ? '' : username.slice(separator)}`;
        url.password = password;
        process.stdout.write(
          `Private platform service credential; save it now in the platform deployment only:\nPLATFORM_DATABASE_URL=${url.href}\n`,
        );
      } catch (error) {
        await c.query('ROLLBACK');
        throw error;
      } finally {
        c.release();
      }
      return;
    }
    const loginId = z
      .string()
      .trim()
      .min(1)
      .max(100)
      .parse(await terminal.question('Owner login ID: '));
    const c = await pool.connect();
    let ownerId: string;
    const version = randomUUID(),
      secret = newMfaSecret(),
      password = generateOpaqueToken(24);
    try {
      await c.query('BEGIN');
      const old = (
        await c.query<{ id: string }>(
          'SELECT id FROM platform.accounts WHERE login_id=$1 FOR UPDATE',
          [loginId],
        )
      ).rows[0];
      if ((command === 'create' && old) || (command !== 'create' && !old))
        throw new Error('Account state does not match the requested operation');
      ownerId = old?.id ?? randomUUID();
      if (command === 'disable') {
        await c.query('UPDATE platform.accounts SET active=false WHERE id=$1', [ownerId]);
      } else {
        const encrypted = encryptMfaSecret(
          secret,
          { schoolId: 'platform', userId: ownerId, version },
          platformKey(),
        );
        const hash = await hashPassword(password);
        if (command === 'create') {
          const name = z
            .string()
            .trim()
            .min(1)
            .max(150)
            .parse(await terminal.question('Owner display name: '));
          await c.query(
            'INSERT INTO platform.accounts(id,login_id,display_name,password_hash,mfa_secret_enc,mfa_version) VALUES($1,$2,$3,$4,$5,$6)',
            [ownerId, loginId, name, hash, encrypted, version],
          );
        } else
          await c.query(
            'UPDATE platform.accounts SET active=false,password_hash=$2,mfa_secret_enc=$3,mfa_version=$4,enrolled_at=NULL,last_step=-1 WHERE id=$1',
            [ownerId, hash, encrypted, version],
          );
      }
      await c.query('UPDATE platform.sessions SET revoked_at=clock_timestamp() WHERE owner_id=$1', [
        ownerId,
      ]);
      await c.query(
        'INSERT INTO platform.audit(owner_id,action,reason,details) VALUES($1,$2,$3,$4)',
        [ownerId, `operator_${command}`, reason, { operator }],
      );
      await c.query('COMMIT');
    } catch (error) {
      await c.query('ROLLBACK');
      throw error;
    } finally {
      c.release();
    }
    if (command === 'disable') {
      process.stdout.write('Owner disabled; sessions revoked.\n');
      return;
    }
    process.stdout.write(
      `Private initial password: ${password}\nPrivate authenticator URI: otpauth://totp/${encodeURIComponent(`NexoraOwner:${loginId}`)}?secret=${secret}&issuer=NexoraOwner&algorithm=SHA1&digits=6&period=30\n`,
    );
    removePage = await showEnrollmentPage(loginId, secret);
    process.stdout.write(
      'Use only the NEW authenticator entry from this run. Previous entries no longer work.\n',
    );
    const expires = Date.now() + 300_000;
    for (let tries = 0; tries < 5; tries++) {
      const code = await terminal.question('Authenticator confirmation code: ');
      const now = (await pool.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0].now;
      const step = matchingTotpStep(secret, code.trim(), now);
      if (Date.now() > expires) {
        process.stderr.write(
          'Enrollment expired. Account remains inactive; restart recovery when ready.\n',
        );
        break;
      }
      if (step !== undefined) {
        const confirmationClient = await pool.connect();
        try {
          await confirmationClient.query('BEGIN');
          const updated = await confirmationClient.query(
            'UPDATE platform.accounts SET active=true,enrolled_at=$3,last_step=$4 WHERE id=$1 AND mfa_version=$2 RETURNING id',
            [ownerId, version, now, step],
          );
          if (!updated.rowCount) throw new Error('Enrollment changed; restart recovery');
          await confirmationClient.query(
            "INSERT INTO platform.audit(owner_id,action,reason,details) VALUES($1,'operator_mfa_confirmed',$2,$3)",
            [ownerId, reason, { operator }],
          );
          await confirmationClient.query('COMMIT');
        } catch (error) {
          await confirmationClient.query('ROLLBACK');
          throw error;
        } finally {
          confirmationClient.release();
        }
        process.stdout.write('Owner active. Wait for a fresh code before signing in.\n');
        return;
      }
      process.stdout.write(
        `Code did not match. Use the NEW entry from this run. ${4 - tries} attempts remain.\n`,
      );
    }
    throw new Error(
      'Confirmation failed or expired; owner remains inactive. Use protected recovery to restart.',
    );
  } finally {
    removePage();
    terminal.close();
    await pool.end();
  }
}
main().catch(() => {
  process.stderr.write(
    'Platform operator action failed. Check account state and private configuration; no credentials were logged.\n',
  );
  process.exitCode = 1;
});
