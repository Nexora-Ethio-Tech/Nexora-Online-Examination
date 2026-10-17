# Teacher authoring and import worker

The authoring module implements the existing teacher routes for assignments, draft metadata, item review, submission, DOCX/XLSX upload, job status and AI retry. It keeps original upload bytes private in PostgreSQL, and keeps immutable pre-edit/pre-replacement/submitted snapshots. Approval is a separate administrator operation.

Migrations 012 and 013 add authoring evidence, durable upload source, leases and AI token reservations. Migration 012 also reconciles legacy authoring columns already present on the configured database but absent from repository migration history. Both were applied to the authorized Supabase database on 17 October 2026.

## Worker trigger

Configure a private backend `IMPORT_WORKER_SECRET` of at least 32 random characters. A trusted scheduler calls `POST /api/v1/internal/import-worker` with `Authorization: Bearer <secret>` and JSON `{ "schoolId": "the-school-uuid" }`. Do not expose the secret through frontend variables or URLs. The handler rejects absent/incorrect secrets and has no browser-session authorization shortcut.

Each call claims at most one parse job and up to two AI jobs. Repeated scheduler calls drain the queue; GET job reads never process work. Configure the scheduler and its school IDs on the backend host before using imports there. A database-backed queue is not evidence that a hosting scheduler has been installed. No hosted scheduler was configured in this task.

Parse leases last two minutes. AI leases last 90 seconds, provider calls time out after 30 seconds, and eligible transient errors retry at most twice. Duplicate worker triggers respect the leases, with two active AI leases per school. Expired leases can be reclaimed after a restart. Output is applied only to the current import and matching unreviewed item input hash; it never changes the answer key or sets the teacher-reviewed flag.

`AI_IMPORT_TOKEN_BUDGET` defaults to 1,000,000 reservation units per import. Reservations conservatively include the configured maximum output tokens, estimated input allowance and overhead; they are not reported as actual provider usage. Successful provider usage is stored separately. Retry reservations remain charged even when the outcome is unknown, preventing automatic retries from bypassing the bound. Model configuration is described in [AI configuration](ai-provider-configuration.md).

Failed parsing leaves prior questions intact. Failed AI retains parsed questions and successful suggestions; teachers may finish review manually. The failed import's UI shows a failure instead of invented completion. A retry does not overwrite reviewed or changed items.

## Verification boundary

The scoped Supabase suite includes actual DOCX upload, durable processing with a deterministic synthetic AI adapter, duplicate upload replay, unauthorized status access, and failed-replacement preservation. Parser tests compare the real DOCX/XLSX fixtures, read the twenty-question workbook, preserve Unicode, and reject malformed archives, external relationships, embedded objects, XML entities and invalid rows. The live English provider sample was tested separately; Amharic acceptance was explicitly deferred by the owner.

The remaining acceptance work includes broader restart/race/failure cases, full browser authoring through the deployed API, maximum-size performance, deployment scheduling, dependency-audit remediation, and the administrator approval/package/scheduling flow.


## Local continuous worker

From `nexora-backend`, run `npm run worker -- --school <school UUID>` in a separate terminal alongside the API. This uses the same ignored environment file and restricted database role. The school UUID is available in the authenticated `/api/v1/auth/me` response. Add `--once` for one bounded pass. Stop with Ctrl+C; committed leases allow another worker to recover unfinished work. The process prints counts only, not question content or credentials. Run one process per configured school, or use an authenticated external scheduler to call the existing internal endpoint. A platform that freezes processes after HTTP responses must use that external scheduler; do not rely on background promises.

The worker now processes approved package jobs as well as imports/AI. New release keys are wrapped with a derived, purpose-separated key from `MFA_ENCRYPTION_KEY`, bound to school and version. Back up that master secret privately; changing it without rewrapping stored MFA secrets and package keys makes them unreadable. Historical raw package keys remain read-compatible, but new writes never use that format.
