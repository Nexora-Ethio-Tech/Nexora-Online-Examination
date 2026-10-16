import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';
// Only build outputs enter this cache. Auth/API responses and exam data never do.
export function offlineShell(buildId: string): Plugin {
  return {
    name: 'nexora-offline-shell',
    apply: 'build',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const files = Object.keys(bundle)
          .filter((name) => name === 'index.html' || name.startsWith('assets/'))
          .map((name) => `/${name}`);
        if (!files.includes('/index.html')) throw new Error('Offline shell requires index.html.');
        const manifest = Object.fromEntries(
          files.map((file) => {
            const entry = bundle[file.slice(1)];
            if (!entry) throw new Error('Missing shell asset.');
            return [
              file,
              createHash('sha256')
                .update(entry.type === 'chunk' ? entry.code : entry.source)
                .digest('hex'),
            ];
          }),
        );
        this.emitFile({
          type: 'asset',
          fileName: 'sw.js',
          source: offlineWorker(buildId, manifest),
        });
      },
    },
  };
}
export function offlineWorker(buildId: string, manifest: Record<string, string>) {
  return `
const VERSION = ${JSON.stringify(buildId)};
const CACHE = 'nexora-shell-' + VERSION;
const MANIFEST = ${JSON.stringify(manifest)};
const FILES = Object.keys(MANIFEST);
async function valid(response, hash) {
  if (!response || !response.ok) return false;
  const digest = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('') === hash;
}
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  for (const file of FILES) {
    const response = await fetch(file, { cache: 'reload', credentials: 'omit' });
    if (!await valid(response, MANIFEST[file])) throw new Error('Invalid shell asset');
    await cache.put(file, response);
  }
})()));
// Never skipWaiting, claim existing clients, or delete another build's cache.
self.addEventListener('message', event => {
  if (event.data?.type !== 'NEXORA_SHELL_CHECK') return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const checks = await Promise.all(FILES.map(async file => valid(await cache.match(file), MANIFEST[file])));
    event.ports[0]?.postMessage({ version: VERSION, ready: checks.every(Boolean) });
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const route = event.request.mode === 'navigate' && /^\\/(?:$|student(?:\\/|$)|teacher(?:\\/|$)|admin(?:\\/|$)|login$|mfa$)/.test(url.pathname);
  if (!route && !FILES.includes(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return await cache.match(route ? '/index.html' : url.pathname) || fetch(event.request);
  })());
});
`;
}
