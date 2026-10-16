import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { releaseSource } from './release-source.ts';

const config = { framework: 'vite', routes: [{ src: '/a' }, { src: '/b' }] };
function fixture(t: TestContext) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'nexora-release-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  const write = (file: string, text: string) => writeFileSync(path.join(cwd, file), text);
  git('init', '--quiet');
  git('config', 'user.name', 'Release test');
  git('config', 'user.email', 'release@example.invalid');
  write('.gitignore', '.vercel/\n');
  write('vercel.json', JSON.stringify(config, null, 2) + '\n');
  write('source.txt', 'original\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'fixture');
  return { cwd, git, write, read: () => releaseSource(cwd, {}) };
}

test('clean checkout and Vercel generated files remain clean', (t) => {
  const f = fixture(t);
  assert.equal(f.read().dirty, false);
  mkdirSync(path.join(f.cwd, '.vercel'));
  f.write('.vercel/project.json', '{}');
  assert.equal(f.read().dirty, false);
});
test('JSON whitespace and object key order are harmless', (t) => {
  const f = fixture(t);
  f.write('vercel.json', JSON.stringify({ routes: config.routes, framework: 'vite' }));
  assert.equal(f.read().dirty, false);
});
test('configuration values and route array order remain significant', (t) => {
  const f = fixture(t);
  f.write('vercel.json', JSON.stringify({ ...config, framework: 'other' }));
  assert.equal(f.read().dirty, true);
  f.write('vercel.json', JSON.stringify({ ...config, routes: [...config.routes].reverse() }));
  assert.equal(f.read().dirty, true);
});
test('invalid or deleted configuration remains dirty', (t) => {
  const f = fixture(t);
  f.write('vercel.json', '{');
  assert.equal(f.read().dirty, true);
  rmSync(path.join(f.cwd, 'vercel.json'));
  assert.equal(f.read().dirty, true);
});
test('real source changes are not hidden by formatting normalization', (t) => {
  const f = fixture(t);
  f.write('vercel.json', JSON.stringify(config));
  f.write('source.txt', 'changed');
  assert.equal(f.read().dirty, true);
  f.git('add', 'source.txt');
  assert.equal(f.read().dirty, true);
});
test('untracked source remains dirty', (t) => {
  const f = fixture(t);
  f.write('new-source.txt', 'new');
  assert.equal(f.read().dirty, true);
});
test('staged configuration change cannot hide behind a restored working copy', (t) => {
  const f = fixture(t);
  f.write('vercel.json', JSON.stringify({ ...config, framework: 'other' }));
  f.git('add', 'vercel.json');
  f.write('vercel.json', JSON.stringify(config));
  assert.equal(f.read().dirty, true);
});
test('Vercel SHA must match HEAD and does not force a clean result', (t) => {
  const f = fixture(t);
  const commit = f.read().commit;
  const env = { VERCEL: '1', VERCEL_GIT_COMMIT_SHA: commit };
  assert.deepEqual(releaseSource(f.cwd, env), { commit, dirty: false });
  f.write('source.txt', 'changed');
  assert.equal(releaseSource(f.cwd, env).dirty, true);
  assert.throws(() => releaseSource(f.cwd, { ...env, VERCEL_GIT_COMMIT_SHA: '0'.repeat(40) }));
});
test('missing Git metadata fails instead of claiming clean source', (t) => {
  const f = fixture(t);
  rmSync(path.join(f.cwd, '.git'), { recursive: true, force: true });
  assert.throws(() => releaseSource(f.cwd, { VERCEL: '1', VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40) }));
});
