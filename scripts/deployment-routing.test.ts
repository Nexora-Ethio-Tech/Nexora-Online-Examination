import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
function config(values: Record<string, string>) {
  const env = { ...process.env };
  for (const key of [
    'API_PROXY_TARGET',
    'PLATFORM_API_PROXY_TARGET',
    'VITE_APP_SURFACE',
    'VERCEL_URL',
    'VERCEL_PROJECT_PRODUCTION_URL',
  ])
    delete env[key];
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import {config} from './vercel.ts'; console.log(JSON.stringify(config));",
    ],
    { env: { ...env, ...values }, encoding: 'utf8' },
  );
}
test('school API routes precede SPA fallback and invigilator/owner deep links open the app', () => {
  const result = config({ API_PROXY_TARGET: 'https://school.example' });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.routes[1].dest, 'https://school.example$1');
  const fallback = parsed.routes.find((r: { dest?: string }) => r.dest === '/index.html');
  assert.match('/invigilator', new RegExp(fallback.src));
  assert.match('/platform/schools', new RegExp(fallback.src));
  assert.doesNotMatch('/missing.js', new RegExp(fallback.src));
});
test('owner deployment requires only its separate API and keeps it same-origin for cookies', () => {
  const result = config({
    VITE_APP_SURFACE: 'platform',
    PLATFORM_API_PROXY_TARGET: 'https://owner.example',
  });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.routes[1].dest, 'https://owner.example/api/v1$1');
  assert.equal(parsed.routes[1].headers['Cache-Control'], 'private, no-store');
});
test('rejects missing targets, insecure origins and proxy loops', () => {
  for (const values of [
    {},
    { VITE_APP_SURFACE: 'platform' },
    { API_PROXY_TARGET: 'http://school.example' },
    { API_PROXY_TARGET: 'https://school.example/api/v1' },
    { API_PROXY_TARGET: 'https://front.example', VERCEL_URL: 'front.example' },
  ])
    assert.notEqual(config(values).status, 0);
});
