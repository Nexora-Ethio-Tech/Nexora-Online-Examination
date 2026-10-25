# Production owner setup — 25 October 2026

## Verified state

- Existing Vercel school frontend: `nexora-online-examination` (repository root).
- Existing school backend: `nexora-online-examination-mpud` (`nexora-backend`). Both were Ready on main commit `4f79329` when inspected.
- Production migrations were completed earlier; see the production migration report. This work does not copy local test data into production.
- Production had zero owner accounts before setup. The existing `nexora_platform` role was NOLOGIN.
- Provisioned that restricted role with a new random password and recorded `runtime_provisioned` in the platform audit. Verified a connection using that role and the Supabase CA with certificate validation enabled. The backend role-isolation predicate passed: no superuser, bypass-RLS, create-role, create-database, replication, role membership, object ownership or schema-create privileges.
- Generated a separate owner MFA encryption key. Private settings are outside Git, in the operator's restricted local folder. Never attach that file to a ticket, commit it, or put its contents in chat.
- Owner deployment, owner MFA activation, test-school provisioning and end-to-end hosted enrollment remain pending. The new backend import form is prepared, not deployed.

## Enrollment-link corrections

The owner frontend must set `VITE_SCHOOL_PORTAL_ORIGIN=https://nexora-online-examination.vercel.app`. Its administrator setup links now point to that school origin, even when the owner uses another origin. Tokens stay in the URL fragment rather than the query string. A helper rejects unsafe origins; localhost remains supported for local testing.

The school frontend's Vercel SPA fallback now includes `/admin-enrollment`. Directly opening a private enrollment link must load the enrollment page instead of a 404. Owner builds require the school origin in addition to their owner API target.

## Deployment configuration

Create the owner backend from this repository, root `nexora-backend`, NestJS preset. Intended project name: `nexora-owner-api`.

Use **Production only** for its private environment. Required settings: `NEXORA_SERVICE=platform`, `NODE_ENV=production`, `PLATFORM_DATABASE_URL`, `PLATFORM_MFA_ENCRYPTION_KEY`, `APP_ORIGIN`, `DB_SSL_CA`, `DB_SSL_REJECT_UNAUTHORIZED=true`, `DB_POOL_MAX=1`. The prepared file uses the intended owner origin `https://nexora-owner.vercel.app`; verify the actual frontend domain and adjust APP_ORIGIN if Vercel assigns another domain. Never copy `DATABASE_URL`, `MIGRATION_DATABASE_URL` or `MFA_ENCRYPTION_KEY` from the school backend into this service.

Create the owner frontend from the repository root, Vite preset, intended name `nexora-owner`. Set `VITE_APP_SURFACE=platform`, `VITE_USE_MOCKS=false`, `VITE_PLATFORM_API_BASE_URL=/platform-api/v1`, `PLATFORM_API_PROXY_TARGET` to the actual owner backend HTTPS origin, and `VITE_SCHOOL_PORTAL_ORIGIN` to the school frontend origin. No credentials belong in VITE variables. The repository's `vercel.ts` provides same-origin API proxying.

The owner key encrypts owner MFA secrets; it is not a login password or six-digit authenticator code. Preserve it across redeployments. Each administrator has their own authenticator enrollment, backed by the existing school key, which this setup does not rotate.

## Acceptance sequence

1. Verify both owner deployments are Ready and match the reviewed main commit. Verify their actual domains and APP_ORIGIN agree.
2. Open the owner frontend. Its CSRF bootstrap must reach the owner API; unauthenticated protected reads must reject access. School accounts must not grant owner access.
3. Run the protected owner operator in a private terminal with production migration credentials, verified CA and the same owner encryption key used by the deployed backend. Choose the owner login ID and name, save the generated password privately, scan the setup URI on the owner's phone, and confirm the six-digit code. Never derive and submit a confirmation code automatically in place of the owner.
4. Wait for a fresh code, sign in to the owner portal, then create a clearly fictional test school using another fresh code. Confirm a three-digit school code and first-administrator credential are returned.
5. Open the private administrator enrollment link. It must use the **school** frontend origin and load directly. Verify credentials, scan the administrator's own QR code, and confirm enrollment. The administrator must be inactive before confirmation and able to sign in afterward.
6. Verify reused, expired and invalid enrollment tokens are rejected, and confirm credentials/tokens do not enter browser storage or routine logs. Avoid exposing the real setup link in screenshots.
7. Test school workflows with fictional students and exams. These records persist in the real database; this is not the demo or local database.

## Validation

Frontend `npm run check` (typecheck, lint, formatting and tests) and `npm run build` passed for the enrollment-link corrections. Tests cover explicit school-origin links, fragment-only tokens, rejected unsafe origins, direct enrollment routing and mandatory owner deployment origins. These checks do not establish hosted deployment success or completed phone enrollment.
