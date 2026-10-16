/// <reference types="node" />
import { createHash, webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { offlineWorker } from '../../scripts/offline-shell';
type Event = {
  waitUntil: (task: Promise<unknown>) => void;
  respondWith: (response: Promise<Response>) => void;
  request: { url: string; method: string; mode: string };
  data?: { type: string };
  ports?: { postMessage: (value: unknown) => void }[];
};
function harness(corrupt = false) {
  const assets: Record<string, string> = {
    '/index.html': '<html>app shell</html>',
    '/assets/app.js': '/* application */',
  };
  const manifest = Object.fromEntries(
    Object.entries(assets).map(([key, value]) => [
      key,
      createHash('sha256').update(value).digest('hex'),
    ]),
  );
  const contents = new Map<string, Response>();
  const events = new Map<string, (event: Event) => void>();
  const cache = {
    put: async (key: string, response: Response) => {
      contents.set(key, response);
    },
    match: async (key: string) => contents.get(key)?.clone(),
  };
  const fetch = vi.fn(async (url: string) => new Response(corrupt ? 'wrong build' : assets[url]));
  const skipWaiting = vi.fn();
  const claim = vi.fn();
  const remove = vi.fn();
  runInNewContext(offlineWorker('build-a', manifest), {
    crypto: webcrypto,
    URL,
    Uint8Array,
    self: {
      location: { origin: 'https://exam.test' },
      addEventListener: (name: string, listener: (event: Event) => void) =>
        events.set(name, listener),
      skipWaiting,
      clients: { claim },
    },
    fetch,
    caches: { open: async () => cache, delete: remove },
  });
  const dispatch = async (name: string, overrides: Partial<Event> = {}) => {
    let pending: Promise<unknown> = Promise.resolve();
    let response: Promise<Response> | undefined;
    events.get(name)?.({
      waitUntil: (task) => {
        pending = task;
      },
      respondWith: (result) => {
        response = result;
      },
      request: { url: 'https://exam.test/student/attempts/a', method: 'GET', mode: 'navigate' },
      ...overrides,
    });
    await pending;
    return response;
  };
  return { contents, fetch, skipWaiting, claim, remove, dispatch };
}
describe('versioned offline app shell', () => {
  it('verifies assets and serves frontend navigation without fetching private data', async () => {
    const worker = harness();
    await worker.dispatch('install');
    const reply = vi.fn();
    await worker.dispatch('message', {
      data: { type: 'NEXORA_SHELL_CHECK' },
      ports: [{ postMessage: reply }],
    });
    expect(reply).toHaveBeenCalledWith({ version: 'build-a', ready: true });
    expect(await (await worker.dispatch('fetch'))?.text()).toContain('app shell');
    expect(
      await worker.dispatch('fetch', {
        request: {
          url: 'https://exam.test/api/v1/attempts/a/package',
          method: 'GET',
          mode: 'cors',
        },
      }),
    ).toBeUndefined();
    expect(
      await worker.dispatch('fetch', {
        request: { url: 'https://exam.test/api/v1/auth/me', method: 'GET', mode: 'navigate' },
      }),
    ).toBeUndefined();
    expect(worker.fetch).toHaveBeenCalledTimes(2);
    expect(worker.skipWaiting).not.toHaveBeenCalled();
    expect(worker.claim).not.toHaveBeenCalled();
    expect(worker.remove).not.toHaveBeenCalled();
  });
  it('rejects changed assets at install and refuses readiness after cache eviction', async () => {
    await expect(harness(true).dispatch('install')).rejects.toThrow('Invalid shell asset');
    const worker = harness();
    await worker.dispatch('install');
    worker.contents.delete('/assets/app.js');
    const reply = vi.fn();
    await worker.dispatch('message', {
      data: { type: 'NEXORA_SHELL_CHECK' },
      ports: [{ postMessage: reply }],
    });
    expect(reply).toHaveBeenCalledWith({ version: 'build-a', ready: false });
  });
});
