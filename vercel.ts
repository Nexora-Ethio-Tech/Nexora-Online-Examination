// Vercel evaluates this file before building. The target stays out of the Vite bundle.
const target = process.env.API_PROXY_TARGET?.trim();
if (!target) {
  throw new Error('Set API_PROXY_TARGET in the frontend Vercel project environment.');
}
const backend = new URL(target);
if (
  backend.protocol !== 'https:' ||
  backend.username ||
  backend.password ||
  backend.pathname !== '/' ||
  backend.search ||
  backend.hash
) {
  throw new Error('API_PROXY_TARGET must be an HTTPS origin without credentials or an API path.');
}
if ([process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL].includes(backend.host)) {
  throw new Error('API_PROXY_TARGET must point to the backend project, not the frontend.');
}

export const config = {
  framework: 'vite',
  installCommand: 'npm ci',
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  routes: [
    {
      src: '^/.*$',
      headers: { 'Cache-Control': 'no-cache, max-age=0, must-revalidate' },
      continue: true,
    },
    {
      src: '^(/api/v1(?:/.*)?)$',
      dest: `${backend.origin}$1`,
      headers: { 'Cache-Control': 'private, no-store' },
    },
    { handle: 'filesystem' },
    {
      src: '^/(?:login|mfa|(?:student|teacher|admin)(?:/[^.]*)?)?/?$',
      dest: '/index.html',
    },
    { src: '^/.*$', status: 404 },
  ],
};
