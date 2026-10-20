import { Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { readFile, writeFile, rename } from 'fs/promises';
import { createInterface } from 'readline/promises';
import { Pool } from 'pg';
import {
  backendEnvPath,
  databasePoolConfig,
  loadBackendEnvironment,
} from '../src/common/db/database-config';
import { mfaEncryptionKey } from '../src/common/crypto/mfa';
import {
  beginMfaEnrollment,
  bootstrapMfaAdministrator,
  confirmMfaEnrollment,
} from '../src/modules/auth/mfa-operator';

loadBackendEnvironment();
const logger = new Logger('mfa-operator');

async function main() {
  const command = process.argv[2];
  if (command === 'init-key') {
    if (process.env.MFA_ENCRYPTION_KEY !== undefined) {
      mfaEncryptionKey();
      logger.log('MFA encryption key already configured; it was not changed.');
      return;
    }
    const original = await readFile(backendEnvPath, 'utf8');
    const temporary = `${backendEnvPath}.mfa.tmp`;
    await writeFile(
      temporary,
      `${original.trimEnd()}\nMFA_ENCRYPTION_KEY=${randomBytes(32).toString('base64url')}\n`,
      { mode: 0o600, flag: 'wx' },
    );
    await rename(temporary, backendEnvPath);
    logger.log(
      'MFA encryption key generated and saved privately in backend .env. Back it up securely.',
    );
    return;
  }
  if (
    !['bootstrap', 'enroll', 'recover', 'confirm'].includes(command ?? '') ||
    !process.stdin.isTTY ||
    !process.stdout.isTTY
  ) {
    throw new Error('Use enroll/recover/confirm only in a private interactive operator terminal');
  }
  mfaEncryptionKey();
  const args = process.argv.slice(3);
  function argument(flag: string): string {
    const index = args.indexOf(flag);
    const value = index < 0 ? undefined : args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing ${flag}`);
    return value;
  }
  const operator = argument('--operator');
  const reason = argument('--reason');
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  const pool = new Pool(databasePoolConfig('migration'));
  try {
    const clock = await pool.query<{ now: Date }>('SELECT clock_timestamp() AS now');
    if (Math.abs(Date.now() - clock.rows[0].now.getTime()) > 90_000) {
      throw new Error(
        'Computer and database clocks differ by more than 90 seconds. Enable automatic date/time and synchronize the computer and phone before retrying.',
      );
    }
    const verified = await terminal.question(
      'Verify authorization and staff identity through the school support contact. Type VERIFIED to continue: ',
    );
    if (verified !== 'VERIFIED') throw new Error('Identity verification required');
    let schoolId: string;
    let userId: string;
    if (command === 'bootstrap') {
      const created = await bootstrapMfaAdministrator(pool, {
        schoolName: argument('--school-name'),
        slug: argument('--school-slug'),
        loginId: argument('--login-id'),
        displayName: argument('--display-name'),
        operator,
        reason,
      });
      schoolId = created.schoolId;
      userId = created.userId;
      process.stdout.write(
        `School ID: ${schoolId}\nAdministrator ID: ${userId}\nPrivate initial password: ${created.password}\n`,
      );
    } else {
      schoolId = argument('--school-id');
      userId = args.includes('--staff-id') ? argument('--staff-id') : argument('--admin-id');
    }
    const context = { schoolId, userId, operator, reason };
    if (command !== 'confirm') {
      const material = await beginMfaEnrollment(
        pool,
        context,
        command === 'recover',
        () => new Date(),
      );
      // Enrollment material is displayed only to this protected TTY, never application logs.
      process.stdout.write(
        `Private enrollment secret: ${material.secret}\nAuthenticator URI: ${material.uri}\n`,
      );
    }
    const code = await terminal.question(
      'Enter the six-digit authenticator code (not a command-line argument): ',
    );
    if (!(await confirmMfaEnrollment(pool, context, code.trim(), () => new Date())))
      throw new Error('Incorrect code; staff account remains inactive');
    logger.log(
      'Staff enrollment verified and activated. Wait for a fresh code before sensitive actions.',
    );
  } finally {
    terminal.close();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const safeMessages = new Set([
    'Computer and database clocks differ by more than 90 seconds. Enable automatic date/time and synchronize the computer and phone before retrying.',
    'Incorrect code; administrator remains inactive',
    'Enrollment absent, expired or locked; restart protected enrollment',
    'Already enrolled; verified recovery is required',
    'Administrator not found in this school',
    'School is inactive',
    'Identity verification required',
  ]);
  if (error instanceof Error && safeMessages.has(error.message)) {
    logger.error(error.message);
    if (error.message === 'Incorrect code; administrator remains inactive')
      logger.error(
        'Use the newest enrollment key and enable automatic date/time on the phone and computer.',
      );
    process.exitCode = 1;
    return;
  }
  logger.error(
    'MFA operator command failed; administrator activation was not confirmed. Check arguments, private configuration and enrollment state.',
  );
  process.exitCode = 1;
});
