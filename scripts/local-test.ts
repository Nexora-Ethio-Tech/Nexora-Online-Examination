import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { localTestSettings } from './local-test-config.ts';

// Private configuration lives outside the Git checkout. Never fall back to hosted .env URLs.
const root = resolve(import.meta.dirname, '..');
const lab = resolve(root, '../.local-test');
const command = process.argv[2];
const automated = command === 'test';
const settings = localTestSettings(
  JSON.parse(readFileSync(resolve(lab, 'config.json'), 'utf8')),
  automated,
);
const env: NodeJS.ProcessEnv = { ...process.env, ...settings, NODE_ENV: 'development' };
let executable = process.execPath;
let args: string[];
let cwd = root;
switch (command) {
  case 'db':
    executable = resolve(lab, 'pgsql/bin/pg_ctl.exe');
    args = ['start', '-D', resolve(lab, 'data'), '-l', resolve(lab, 'postgres.log'), '-w'];
    break;
  case 'backend':
  case 'platform':
    cwd = resolve(root, 'nexora-backend');
    env.NEXORA_SERVICE = command === 'platform' ? 'platform' : 'school';
    env.PORT = command === 'platform' ? '3101' : '3100';
    args = ['dist/src/main.js'];
    break;
  case 'frontend':
    args = [
      'node_modules/vite/bin/vite.js',
      '--host',
      '127.0.0.1',
      '--port',
      '5183',
      '--strictPort',
    ];
    break;
  case 'worker':
    if (!settings.WORKER_SCHOOL_IDS?.trim())
      throw new Error(
        'Add WORKER_SCHOOL_IDS to the private manual local-test configuration before starting the worker.',
      );
    cwd = resolve(root, 'nexora-backend');
    args = ['dist/scripts/run-worker.js'];
    break;
  case 'test':
    cwd = resolve(root, 'nexora-backend');
    env.NODE_ENV = 'test';
    env.RUN_SUPABASE_OPERATIONAL_TESTS = 'true';
    env.RUN_REAL_BROWSER = 'true';
    env.NEXORA_LOCAL_INTEGRATION = 'true';
    args = [
      'node_modules/vitest/vitest.mjs',
      'run',
      'test/operational-integration.e2e-spec.ts',
      'test/local-portal-schema.e2e-spec.ts',
    ];
    break;
  default:
    throw new Error(
      'Choose db, backend, platform, frontend, worker or test. Test uses only the disposable database and reserves port 5184.',
    );
}
const child = spawn(executable, args, { cwd, env, stdio: 'inherit', windowsHide: true });
child.on('error', (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
