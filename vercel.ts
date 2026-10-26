// Vercel evaluates this file before building. The target stays out of the Vite bundle.
function targetOrigin(name: string, required: boolean) {
  const value = process.env[name]?.trim();
  if (!value) {
    if (required) throw new Error(`Set ${name} in the frontend Vercel project environment.`);
    return null;
  }
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error(`${name} must be an HTTPS origin without credentials or an API path.`);
  if ([process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL].includes(url.host))
    throw new Error(`${name} must point to the backend project, not the frontend.`);
  return url.origin;
}
const combinedSurface = process.env.VITE_APP_SURFACE === 'combined';
const ownerSurface = process.env.VITE_APP_SURFACE === 'platform';
const backend = targetOrigin('API_PROXY_TARGET', !ownerSurface);
const ownerBackend = targetOrigin('PLATFORM_API_PROXY_TARGET', ownerSurface);
if (ownerSurface) targetOrigin('VITE_SCHOOL_PORTAL_ORIGIN', true);

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
    ...(backend
      ? [
          {
            src: '^(/api/v1(?:/.*)?)$',
            dest: `${backend}$1`,
            headers: { 'Cache-Control': 'private, no-store' },
          },
        ]
      : []),
    ...(combinedSurface && backend
      ? [
          {
            src: '^(/platform-api/v1(?:/.*)?)$',
            dest: `${backend}$1`,
            headers: { 'Cache-Control': 'private, no-store' },
          },
        ]
      : []),
    ...(!combinedSurface && ownerBackend
      ? [
          {
            src: '^/platform-api/v1(/.*)?$',
            dest: `${ownerBackend}/api/v1$1`,
            headers: { 'Cache-Control': 'private, no-store' },
          },
        ]
      : []),
    { handle: 'filesystem' },
    {
      src: '^/(?:login|mfa|admin-enrollment|(?:student|teacher|admin|invigilator|platform)(?:/[^.]*)?)?/?$',
      dest: '/index.html',
    },
    { src: '^/.*$', status: 404 },
  ],
};
