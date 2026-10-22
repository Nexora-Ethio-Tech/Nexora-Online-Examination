import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localTestSettings } from './local-test-config.ts';
const settings = (db: string) =>
  Object.fromEntries(
    ['DATABASE_URL', 'MIGRATION_DATABASE_URL', 'PLATFORM_DATABASE_URL'].map((key) => [
      key,
      `postgresql://test:synthetic@127.0.0.1:55432/${db}`,
    ]),
  );
const configuration = () => ({
  manual: settings('nexora_manual_test'),
  automated: settings('nexora_be02a_test'),
});
test('manual and automatic tests select distinct persistent and disposable databases', () => {
  const config = configuration();
  assert.match(localTestSettings(config, false).DATABASE_URL, /nexora_manual_test$/);
  assert.match(localTestSettings(config, true).DATABASE_URL, /nexora_be02a_test$/);
});
for (const key of ['DATABASE_URL', 'MIGRATION_DATABASE_URL', 'PLATFORM_DATABASE_URL']) {
  test(`rejects hosted ${key} rather than inheriting it`, () => {
    const config = configuration();
    config.manual[key] = 'postgresql://test:synthetic@example.com:5432/postgres';
    assert.throws(() => localTestSettings(config, false));
  });
}
test('rejects missing connections, wrong port and swapped manual/disposable targets', () => {
  const missing = configuration();
  delete missing.manual.DATABASE_URL;
  assert.throws(() => localTestSettings(missing, false));
  const port = configuration();
  port.manual.DATABASE_URL = port.manual.DATABASE_URL.replace('55432', '5432');
  assert.throws(() => localTestSettings(port, false));
  const swapped = configuration();
  swapped.automated = swapped.manual;
  assert.throws(() => localTestSettings(swapped, true));
});
