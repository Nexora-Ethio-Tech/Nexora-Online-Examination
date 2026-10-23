# Connect the frontend to the deployed backend

24 October update: see [deployment handoff](deployment-developer-handoff.md) for the separate owner surface, `PLATFORM_API_PROXY_TARGET`, migrations through 029 and hosted acceptance gates. The main configuration now handles invigilator and platform deep links.

The frontend keeps `VITE_API_BASE_URL=/api/v1` and `VITE_USE_MOCKS=false`. Its Vercel project must also define `API_PROXY_TARGET` as the backend HTTPS origin, for example `https://your-backend.vercel.app`, with no `/api/v1` suffix. Set all three variables for Preview and Production in Settings → Environment Variables, then deploy the commit containing `vercel.ts`. Local `.env.local` changes are not uploaded to Vercel.

The frontend's `vercel.ts` replaces the root `vercel.json`. Vercel evaluates it before building and forwards `/api/v1` requests to the configured backend, preserving the path. API routing runs before static-file and application-route handling. Missing assets still return 404; HTML, `sw.js` and `release.json` retain no-cache headers. API responses are private/no-store. The browser continues using the frontend origin for session and browser-device cookies; do not switch to a direct cross-site API URL for the existing SameSite=Lax cookie flow.

On the backend project, set `APP_ORIGIN` to the exact stable frontend HTTPS origin, without a trailing slash. `CORS_ORIGIN` can allow one additional exact origin, such as the Preview currently being tested. Generated Preview origins are not automatically trusted. Redeploy the backend after changing these settings. Do not use wildcard origins or disable CSRF checks.

The backend endpoint must be reachable by Vercel's proxy. If backend deployment protection returns a Vercel login page, frontend login will not work until server-to-server access is configured; signing into frontend deployment protection is not proof of upstream access. Keep secrets out of `VITE_` variables.

After deploying, `/api/v1/auth/me` should return backend JSON (normally 401 before sign-in), rather than a Vercel 404 or an HTML login page. Verify sign-in and sign-out, MFA for administrators, and that missing assets retain a real 404. The current change has not been verified on a hosted deployment.

Reference: [Vercel programmatic configuration](https://vercel.com/docs/project-configuration/vercel-ts) and [external rewrites](https://vercel.com/docs/routing/rewrites).
