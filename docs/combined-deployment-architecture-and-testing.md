# Two-deployment setup: one frontend and one backend

## Architecture
The frontend supports school routes and /platform on one origin. Credentials and server-side permissions govern access; URL choice alone grants nothing. In combined mode everyone uses /login. The server verifies the ID and password before identifying an owner; owners complete MFA and open /platform, while school accounts keep their existing role-specific destinations. No account-type selector or ID prefix is used.
Set VITE_APP_SURFACE=combined on the frontend and NEXORA_SERVICE=combined on the backend. Existing school/platform standalone modes remain available for rollback.
The combined backend starts two Nest application instances in one process. A boundary-checked dispatcher routes /platform-api/v1 exclusively to the owner application before school guards run. School requests remain under /api/v1. No public-route bypass was added to school guards.
Separate session cookies, CSRF checks, MFA keys and restricted database pools remain. School uses nexora_runtime; owner uses nexora_platform. Runtime configuration rejects migration credentials in the production owner/combined service and rejects identical owner/school MFA keys. Combining hosting increases the impact of a process-level compromise because both runtime secrets are in the same process; it does not merge permissions.

## Configuration and rollout
1. Build and test the same repository revision for frontend and backend. Apply migration 034 before using structured-content code. Do not reset or seed production.
2. On the existing school backend, retain school configuration and add PLATFORM_DATABASE_URL and PLATFORM_MFA_ENCRYPTION_KEY using the existing owner values privately. Do not generate replacement keys; existing enrollment depends on the originals. Set NEXORA_SERVICE=combined. Keep verified TLS and APP_ORIGIN at the shared frontend origin. Never add MIGRATION_DATABASE_URL to deployed runtime variables. Both database pools need capacity planning; DB_POOL_MAX applies to each.
3. On the school frontend, set VITE_APP_SURFACE=combined, VITE_USE_MOCKS=false, API_PROXY_TARGET to the school backend origin, VITE_API_BASE_URL=/api/v1 and VITE_PLATFORM_API_BASE_URL=/platform-api/v1. Set VITE_SCHOOL_PORTAL_ORIGIN to this same frontend origin or remove it so enrollment links use the current origin. PLATFORM_API_PROXY_TARGET is not used in combined mode.
4. Deploy backend then frontend. Check owner and school accounts through the same /login form using separate accounts, MFA, school creation and administrator enrollment. Existing cookies from the old owner origin do not move: sign in again; passwords and MFA secrets do not change.
5. Keep the old owner deployments until those checks pass. Only then retire them in Vercel. No Vercel project deletion is performed by these source changes.

## Verification
Test owner namespace dispatch and near-match rejection. School cookies must not authenticate owner endpoints; owner cookies must not authenticate school endpoints. Missing/wrong CSRF and untrusted Origin must fail. Test separate pool configuration, forbidden migration credentials and distinct keys. Frontend proxy tests must show both APIs reach one backend and do not fall through to HTML. Existing authorization suites must continue passing.
Real Vercel environment transfer, final live smoke checks and retirement of old projects require deployment work; they are not established by local unit tests.

## Verification completed locally (26 October 2026)

Frontend typecheck, lint, formatting, unit tests and production build passed. Backend build and 237 unit tests passed. Migration 034 was applied to the isolated nexora_be02a_test database on localhost only. Thirty real API/database/browser integration checks passed, including owner/school cookie isolation, Origin rejection, structured save/replay/stale-revision checks, review invalidation, approval/package freezing and a 360px editor save/reload journey with a no-horizontal-overflow assertion. The mobile screenshot was inspected. No production mutation, live cutover or Vercel project deletion was performed.

## Shared sign-in implementation
The frontend first uses the existing school login. Only an invalid-credentials (401) response in combined mode continues to isolated owner CSRF bootstrap and /platform-api/v1/auth/identify. Rate limits, network failures and CSRF failures are never bypassed through fallback. Valid school logins make no owner API requests. A matching active, enrolled owner gets a rotated five-minute session with owner_id but no authenticated_at. This grants no owner access. Passwords are cleared from the form; only the challenge flag remains in React memory, and no password is carried to the MFA page.
If neither endpoint verifies credentials, the original generic login error is shown. Identical owner and school IDs are disambiguated by verified passwords; if both ID and password are identical, the school account takes precedence, preserving its normal role and MFA requirement. Use distinct IDs for different people. Routing is never based on a prefix or an unauthenticated ID lookup.
POST /platform-api/v1/auth/verify verifies the challenge cookie, trusted Origin, CSRF, active/enrolled owner and fresh TOTP. Enrollment must predate challenge creation (expiry minus its fixed five-minute duration). Successful verification atomically revokes the pending session, consumes the TOTP step, creates a new authenticated session, and records owner_login. Expired/revoked challenges and replayed codes fail. Existing request limits remain. Ordinary school logins do not consume owner IP limits. Owner login attempts still have the stricter per-IP, per-account and per-challenge limits.
Pending owner sessions cannot call owner APIs or authenticate school endpoints. Authenticator recovery invalidates older challenges through enrollment time/session revocation. Reloading MFA returns to sign-in. Standalone owner hosting remains available for rollback; combined mode redirects unauthenticated /platform visitors to /login.

## Shared sign-in acceptance
1. Open /login; there is no owner-vs-school choice in combined mode.
2. Enter owner credentials: MFA appears; owner data remains inaccessible until a valid fresh code succeeds. The destination becomes /platform.
3. Enter school administrator credentials: existing administrator MFA and school portal apply. Student, teacher and invigilator accounts open their own portals.
4. Wrong passwords must not reveal owner status. Wrong Origin/CSRF, expired challenges and reused codes must fail. A pending owner cookie must receive 401 from owner directory endpoints; an authenticated owner cookie must receive 401 from school /auth/me.
5. Sign out from the owner portal and confirm return to shared login. Refresh on MFA and sign in again. Do not store credentials or MFA material in browser storage.
6. Run frontend check/build, backend build/unit tests, and local-test.ts test. Integration creates temporary owner fixtures in the isolated test database and removes them afterward; it does not modify production owners.

No additional database migration is required by shared sign-in itself. Migration 034 remains a prerequisite for the earlier structured-content changes in this branch. Source changes alone neither configure nor remove Vercel projects.

Production migration 034 was applied and verified on 26 October 2026; see [migration report](production-migration-034-2026-10-26.md). Vercel configuration and live combined-hosting checks are still pending.

## Dependency audit gate
The backend audit exposed vulnerable versions of [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) and [multer](https://github.com/advisories/GHSA-q7qp-rjg7-q26m), plus body-parser and Vitest advisories. The release pins Zod 4.6.7 and Vitest 4.1.12, and overrides the existing Nest 11 parser dependencies to multer 2.5.0 and body-parser 2.4.0. Shared parser types and the test record schema were adapted to Zod 4; no security check was disabled. Backend audit reports zero vulnerabilities. Verify full backend typecheck, unit tests and real local integration after this dependency change.

### Browser regression alignment

The synthetic offline submission journey remains uninterrupted. A separate browser regression checks that the first offline focus loss pauses editing, preserves the saved-answer count, and offers no self-resume after focus or connectivity returns. Real staff approval and MFA remain covered by the database integration suite; the mock journey does not claim to verify them.
