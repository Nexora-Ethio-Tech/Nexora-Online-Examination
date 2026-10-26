# Production import processing: architecture and testing

## Problem and observed recovery

On 26 October 2026, a production upload remained `queued`, with no lease and no AI jobs. Upload persistence worked; no scheduler was calling the worker. Refreshing the page or restarting a local API cannot establish durable production processing.

After the operator imported the private worker/Groq/Gemini settings and redeployed the production backend, an authenticated worker pass returned HTTP 200. The affected import reached `ready`, with 2 parsed questions and 2 completed AI jobs. No uploaded content or credentials are included in this report.

This manual recovery is separate from automatic scheduling. Verify the scheduler's enabled flag and subsequent successful requests before calling the rollout complete.

## Architecture

Supabase `pg_cron` calls `nexora_worker_ops.tick()` every 30 seconds. That function selects one active school with eligible import, AI or package work and dispatches a `pg_net` POST to the existing backend worker. Selection rotates by school UUID and wraps around. A newly provisioned school participates automatically. Idle schools do not cause HTTP calls.

One HTTP request is in flight globally. Each worker call handles at most one parse and two AI jobs, alongside existing package preparation. Existing tenant checks, database leases, retry limits, token budgets and stale-input protection remain authoritative. A pending response delays another dispatch; after three minutes a lost response is recoverable. HTTP failures advance rotation so one failing school cannot permanently starve another. Failed jobs are not silently changed to success or retried without the existing policy.

This is a bounded initial production configuration, not a throughput guarantee. Large files and multiple busy schools take multiple passes. Measure queue age before increasing concurrency. Supabase/Vercel quotas, project availability and provider limits still apply. This adds infrastructure inside the existing database and backend; it does not require another Vercel project or an open PC terminal.

## Authentication and secret handling

Supabase's managed `pg_net` queue grants cannot be revoked by the project operator. Request headers must therefore contain no long-lived secret. The dispatcher reads `IMPORT_WORKER_SECRET` from Vault only while computing an HMAC-SHA256 signature. It queues:

- A school UUID and random dispatch UUID.
- A Unix timestamp and signature over the exact version, school, dispatch and timestamp.
- No bearer key, provider key, student information or exam text.

The backend verifies the signature and a 90-second clock window, then atomically consumes the current school-bound dispatch through `nexora_claim_worker_dispatch`. Replays, modified schools and expired dispatches are rejected before processing. Someone who could read the queue can observe a short-lived request; they cannot derive the key, change its scope or run it twice. This is not protection against a compromised database operator or backend runtime.

The private scheduler schema, state and Vault view are inaccessible to ordinary application roles. Only the school runtime receives execution permission on the narrow claim function. Supabase's default object grants are explicitly removed and checked by the installer. Existing bearer POST and `CRON_SECRET` GET triggers remain available for separately trusted operators.

Reference: [Supabase's documented HTTP queue limitation](https://supabase.com/kb/troubleshooting/database-roles-can-read-request-headers-queued-by-pg_net).

## Operator installation and rollback

Use `nexora-backend/scripts/production-worker.ts` from the backend directory with `node --import tsx`. The first argument is `install`, `status`, `enable` or `disable`; the second is the HTTPS backend origin. Optional repeated `--private-config <path>` arguments read ignored private dotenv files. Never commit those files or pass secret values directly as command arguments.

The migration connection is required only by this operator tool. Never add it to Vercel runtime variables. TLS certificate verification remains enabled. `install` is transactional, refuses an existing installation, creates the required Supabase extensions and installs the scheduler **disabled**. It does not run the application migration sequence or delete school data. The SQL is provider-specific infrastructure, deliberately separate from portable local PostgreSQL migrations.

1. Prepare a random worker secret of at least 32 characters privately.
2. Save the same secret as `IMPORT_WORKER_SECRET` in Vercel Production and in the private operator environment. Save approved AI provider configuration in backend secrets too.
3. Install the disabled scheduler, using the existing protected migration connection and verified CA.
4. Deploy the signed-request backend code. Confirm the deployment is Ready and its API is reachable.
5. Run `enable`. It checks deployed bearer authentication against a nonexistent school, then verifies that the configured endpoint and Vault secret match before enabling dispatches.
6. Inspect `status` after an eligible upload. Confirm `last_http_status: 200` and an increasing successful-request count. An HTTP 200 means the worker request completed; inspect the import/AI state separately to establish provider success.

Use `disable` to stop future dispatches. In-flight calls can still finish under their leases. Keep application data, Vault secret and audit evidence; disabling does not erase imports. Do not drop the entire `pg_net`/`pg_cron` extensions because other applications may later use them. Rotating the worker key requires a coordinated Vault/backend change; do not rerun `install` to rotate it.

## Testing

Backend unit tests cover signed scope, tampering, expiry, malformed requests, missing configuration and replay refusal. Existing worker tests retain tenant, lease and authentication coverage.

`scripts/test-production-worker.mjs` executes the actual dispatcher SQL against a dedicated local PostgreSQL database named `nexora_scheduler_test`. Set `SCHEDULER_TEST_DATABASE_URL` privately. It refuses non-loopback hosts or another database name and rolls back its fixtures. The HTTP transport and Vault are synthetic; it makes no external HTTP or AI calls. Checks cover disabled/idle states, signed-payload compatibility with Node, absence of the permanent key from queued requests, school rotation, duplicate dispatch suppression, cancellation, suspension, due retries, live leases, missing responses and nonce consumption.

Production acceptance:

1. Upload a small valid file through the teacher portal without a local worker running.
2. Confirm it progresses from waiting to parsed questions and then AI completion, or an explicit provider failure.
3. Check scheduler status and import counts; never infer AI success solely from HTTP status.
4. Repeat in a newly created school without editing a school-ID list.
5. Cancel a queued file and confirm the scheduler does not resurrect it.
6. Verify manual review and approved-package preparation still work.

Do not test crashes, provider outages or concurrent duplicate deliveries by disrupting live school work. Rehearse those in an isolated test environment. The first recovery proves only the observed two-question file, not all document formats or production capacity.

## Verification recorded on 26 October 2026

- Backend: 245 unit tests passed; TypeScript and production build passed.
- Existing isolated database/browser integration: 31 tests passed.
- Dispatcher SQL: 23 checks passed against dedicated local PostgreSQL, with synthetic HTTP transport.
- Frontend production build passed (existing bundle-size warning remains).
- Production: the affected import reached `ready`, 2 parsed questions and 2 completed AI jobs after a single authenticated worker pass.
- Scheduler installation committed successfully with dispatching disabled. Automatic signed dispatch still requires deployment and explicit enablement; no unattended-processing claim is made by installation alone.
