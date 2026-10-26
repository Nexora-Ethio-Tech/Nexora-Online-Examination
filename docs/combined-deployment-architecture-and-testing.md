# Two-deployment setup: one frontend and one backend

## Architecture
The frontend supports school routes and /platform on one origin. Credentials and server-side permissions govern access; URL choice alone grants nothing. The owner sign-in link opens its MFA-protected login form.
Set VITE_APP_SURFACE=combined on the frontend and NEXORA_SERVICE=combined on the backend. Existing school/platform standalone modes remain available for rollback.
The combined backend starts two Nest application instances in one process. A boundary-checked dispatcher routes /platform-api/v1 exclusively to the owner application before school guards run. School requests remain under /api/v1. No public-route bypass was added to school guards.
Separate session cookies, CSRF checks, MFA keys and restricted database pools remain. School uses nexora_runtime; owner uses nexora_platform. Runtime configuration rejects migration credentials in the production owner/combined service and rejects identical owner/school MFA keys. Combining hosting increases the impact of a process-level compromise because both runtime secrets are in the same process; it does not merge permissions.

## Configuration and rollout
1. Build and test the same repository revision for frontend and backend. Apply migration 034 before using structured-content code. Do not reset or seed production.
2. On the existing school backend, retain school configuration and add PLATFORM_DATABASE_URL and PLATFORM_MFA_ENCRYPTION_KEY using the existing owner values privately. Do not generate replacement keys; existing enrollment depends on the originals. Set NEXORA_SERVICE=combined. Keep verified TLS and APP_ORIGIN at the shared frontend origin. Never add MIGRATION_DATABASE_URL to deployed runtime variables. Both database pools need capacity planning; DB_POOL_MAX applies to each.
3. On the school frontend, set VITE_APP_SURFACE=combined, VITE_USE_MOCKS=false, API_PROXY_TARGET to the school backend origin, VITE_API_BASE_URL=/api/v1 and VITE_PLATFORM_API_BASE_URL=/platform-api/v1. Set VITE_SCHOOL_PORTAL_ORIGIN to this same frontend origin or remove it so enrollment links use the current origin. PLATFORM_API_PROXY_TARGET is not used in combined mode.
4. Deploy backend then frontend. Check school login and /platform login using separate accounts, MFA, school creation and administrator enrollment. Existing cookies from the old owner origin do not move: sign in again; passwords and MFA secrets do not change.
5. Keep the old owner deployments until those checks pass. Only then retire them in Vercel. No Vercel project deletion is performed by these source changes.

## Verification
Test owner namespace dispatch and near-match rejection. School cookies must not authenticate owner endpoints; owner cookies must not authenticate school endpoints. Missing/wrong CSRF and untrusted Origin must fail. Test separate pool configuration, forbidden migration credentials and distinct keys. Frontend proxy tests must show both APIs reach one backend and do not fall through to HTML. Existing authorization suites must continue passing.
Real Vercel environment transfer, final live smoke checks and retirement of old projects require deployment work; they are not established by local unit tests.

## Verification completed locally (26 October 2026)

Frontend typecheck, lint, formatting, unit tests and production build passed. Backend build and 237 unit tests passed. Migration 034 was applied to the isolated nexora_be02a_test database on localhost only. Thirty real API/database/browser integration checks passed, including owner/school cookie isolation, Origin rejection, structured save/replay/stale-revision checks, review invalidation, approval/package freezing and a 360px editor save/reload journey with a no-horizontal-overflow assertion. The mobile screenshot was inspected. No production mutation, live cutover or Vercel project deletion was performed.
