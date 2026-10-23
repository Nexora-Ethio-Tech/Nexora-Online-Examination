# Nexora deployment developer handoff

Prepared 24 October 2026. Share this document with the developer/operator responsible for the hosted deployment. Local work is ready for the user's review; this document is not an instruction to deploy immediately. No production database or hosting settings were changed during local alignment.

Local verification passed: 25 real database/API/browser tests, 214 backend unit tests, 272 frontend tests and 17 tooling checks; frontend/backend production builds and backend test-source typing passed. Both local databases are aligned through migration 029. These results replace the earlier four-failure integration record; they do not certify hosted infrastructure.

## Required external work

| Owner | Action | Evidence needed before release |
| --- | --- | --- |
| Database operator | Back up production, verify restore in an isolated target, compare its schema and migration ledger with this checkout through 029 | Backup/restore record; reviewed ledger differences; migration dry-run result |
| Backend/deployment developer | Deploy school API, separate owner API and frontend from the same reviewed revision | Commit/build IDs and reachable JSON endpoints |
| Hosting operator | Configure exact frontend origins, database TLS, restricted roles, cookie proxying and environment variables | Login/logout/MFA and cross-school denial tests on hosted preview |
| Worker operator | Configure and monitor the durable import/package worker trigger with school coverage | Successful upload → parse → AI → review and package preparation; queue failure alert |
| AI account owner | Verify Gemini availability/quota/model support; rotate previously shared keys before deployment | Successful structured provider probe using new private keys |
| Product/test owner | Test real devices, connectivity loss, staff recovery and expected load | Recorded device/network/load results, not a synthetic-test claim |

These require external account access, operator decisions or human/physical testing; they cannot be completed merely by modifying this checkout. HahuCloud remains a future option; the present deployment configuration targets Vercel.

## Database alignment

- Do **not** run local `.local-test` launchers against Supabase. They intentionally reject hosted URLs. Do not copy local test data, passwords, MFA secrets or owner credentials into production.
- Read `schema_migrations`, then inspect actual columns, constraints, grants and RLS. Some historical hosted migrations were previously absent from the repository; matching numbers alone is insufficient. There is no 021 migration file in this checkout—do not invent or renumber one.
- Review every missing migration, especially 024 lifecycle/counters, 025 grades, 026 invigilator role, 027 automatic results, 028 stable school/teacher numbering and 029 owner import-state access. Rehearse on an isolated copy first.
- Use protected migration credentials only in the migration job. The school runtime must use `nexora_runtime`; the owner runtime must use its separate `nexora_platform` role. Keep operator credentials separate from both services.
- Migration 028 assigns numeric IDs to existing schools without changing existing user logins. Confirm the school-number mapping before distributing new credentials. Counters must survive deletion; do not reset them when restoring individual records.
- Check legacy exams with a null `assignment_id`. Reconcile each against its teacher/class/subject before proposing a data backfill; do not guess ownership or rewrite approved content. The authoring list intentionally requires a valid active assignment.
- Rollback: take services out of write traffic if schema and code diverge; use the verified backup/recovery plan. Do not blindly reverse additive migrations or erase the migration ledger.

## Hosting configuration

School frontend (`vercel.ts`):

```text
VITE_USE_MOCKS=false
VITE_API_BASE_URL=/api/v1
API_PROXY_TARGET=https://<school-backend-origin>
```

Separate owner frontend, built from the same frontend source:

```text
VITE_APP_SURFACE=platform
VITE_USE_MOCKS=false
VITE_PLATFORM_API_BASE_URL=/platform-api/v1
PLATFORM_API_PROXY_TARGET=https://<owner-backend-origin>
```

The owner-only surface does not require a school API target. If deliberately exposing `/platform` from the school frontend too, configure its owner proxy and owner API origin allowlist explicitly. Server deployments and credentials remain separate. Avoid direct cross-site API URLs with the existing SameSite cookie flow. No secrets belong in `VITE_` variables.

School backend: `NEXORA_SERVICE=school`, restricted `DATABASE_URL`, exact `APP_ORIGIN` (and optional second exact `CORS_ORIGIN`), school MFA/package encryption settings, provider keys/model settings, `WORKER_SCHOOL_IDS` and `IMPORT_WORKER_SECRET`. Inventory existing environment names from the backend configuration rather than copying `.env` wholesale. Preserve encryption keys needed to decrypt existing packages/MFA; rotate through a reviewed procedure.

Owner backend: `NEXORA_SERVICE=platform`, `PLATFORM_DATABASE_URL`, separate `PLATFORM_MFA_ENCRYPTION_KEY`, its own exact frontend origin. Production owner startup explicitly rejects school `DATABASE_URL`, `MIGRATION_DATABASE_URL` and school `MFA_ENCRYPTION_KEY` in that process. Verify TLS and the dedicated role. Use protected operator enrollment/recovery commands for the real owner.

The frontend proxy must reach the APIs through any deployment protection. Verify `/api/v1/auth/me` and owner `/platform-api/v1/auth/me` return JSON (401 anonymously), not an HTML login page. Verify `/invigilator` and `/platform` deep-link refresh, API routes before SPA fallback, missing assets returning 404 and no caching of private API responses.

## Worker and provider checks

The API deployment alone does not prove queued work will run. Configure the existing authenticated `/api/v1/internal/import-worker` trigger or the supported worker process. Follow `nextCursor` through all configured schools before beginning a new sweep; preserve lease/retry behavior. Check the deployment's execution limits and schedule capabilities in its actual hosting account. Do not expose the worker bearer secret in the browser or repository.

Groq (`openai/gpt-oss-120b`) returned a valid structured response in the local live probe. Gemini (`gemini-flash-latest`) returned HTTP 503 in the first probe; one bounded retry timed out. Gemini fallback availability is therefore unverified. A configured API key is not proof of service availability. Free quotas and model availability are account/provider dependent; verify them in the provider account. Use synthetic questions for diagnostics and never print API keys in logs.

## Release sequence after user testing

1. Resolve reported product issues; rerun the checks in [local rehearsal](local-release-readiness.md).
2. Review the Git diff and commit list. The pre-existing deletion of `nexora-backend/.env.example` was deliberately left untouched; its owner should decide whether that deletion belongs in the release. Do not stage unrelated files or secrets accidentally.
3. Obtain the user's go-ahead for push/deployment after local review. Push the reviewed commits; deploy an isolated hosted preview with its own database/settings first.
4. Apply the reviewed migration plan, deploy compatible backends and worker, then deploy the matching frontend. Run hosted authentication/MFA, tenant isolation, roster/teacher creation, import/cancel/retry, scheduling, assistance, submission, automatic results and recovery tests.
5. Promote only after those checks and the backup/restore gate pass. Verify production with dedicated synthetic test accounts and safe test schedules; never use real student results as disposable fixtures.

Local automated evidence does not establish production readiness by itself. The current local credentials and databases are for testing only. Forced first-login password change, complete OS screenshot prevention and external email/push result notifications are not implemented promises of this release.
