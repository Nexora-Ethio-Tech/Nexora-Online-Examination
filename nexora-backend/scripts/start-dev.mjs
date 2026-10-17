import { spawn } from 'node:child_process';
import process from 'node:process';
import { resolve } from 'node:path';
const child = spawn(process.execPath, [resolve(import.meta.dirname, '../dist/src/main.js')], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'development' },
  windowsHide: true,
});
child.on('error', () => {
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
