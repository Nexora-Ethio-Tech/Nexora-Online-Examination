# Backend implementation status

Updated: 16 October 2026. Initial audit baseline: `23bc953`. Current task: `SEC-03` exact frontend Origin enforcement, on branch `backend`.
Scope: the actual backend in `nexora-backend/src`, its migrations, scripts and tests, compared with the supplied frontend handoffs through **BE-11 / API v0.12**.

**The backend has a substantial BE-02 student-delivery implementation, but BE-02 is not yet contract-complete. Most later workflows still have no backend endpoints.** Some later features have supporting tables or small pieces of logic; those are identified separately below.

The initial audit was source-only. The approved preparation repairs have now been verified against a disposable local PostgreSQL database: **81 backend tests and 10 frontend tests pass**, backend compilation passes, and root `npm run check` passes. This does not establish staging deployment, production browser, restricted-runtime-role, full MFA or complete BE-02 acceptance.

## Latest completed task: SEC-03 exact Origin enforcement

Implemented:

- CORS and the mutation guard share one validated exact-origin allowlist. Prefix/lookalike hosts, altered ports/schemes, paths, opaque `null` origins and multiple-origin values are rejected. A valid session/CSRF token does not authorize a different Origin.
- Every mutation requires an actual allowed Origin plus the current session-bound CSRF token. Missing Origin is rejected with 403 `CSRF_INVALID`, including when an allowed Referer is supplied. Referer no longer substitutes for Origin.
- `APP_ORIGIN`/`CORS_ORIGIN` accept individual canonical HTTP(S) origins without credentials, paths, trailing slash, query, fragment, wildcard or comma-separated list. Outside explicit development/test, HTTPS and at least one configured origin are required. Local defaults exist only in development/test; `start:dev` now explicitly selects development mode.
- Allowed CORS preflights support credentialed requests without wildcard origins. Disallowed origins return the contract error instead of a generic server error. Readiness remains accessible without an Origin. Login/logout and CSRF rotation remain functional; a focused live administrator MFA/session-rotation regression also passes.

Verification: **13 live Supabase Origin/CSRF tests, 47 unit tests (including 16 configuration cases), and one targeted live MFA/session-rotation regression pass**. The mutation guard also rejects lookalikes independently of CORS middleware. Backend compilation and root `npm run check` pass (10 frontend tests). The MFA smoke command selects one existing case; it does not claim a rerun of the complete MFA suite. Only uniquely identified synthetic school/account/session fixtures were created and cleaned up. No schema migration, seed/reset or local database was used.

New files: [shared Origin/CORS configuration](../src/common/security/origins.ts), [configuration tests](../test/unit/origins.spec.ts), [Supabase Origin/CSRF tests](../test/origin-security.e2e-spec.ts). Modified: startup, CSRF guard, development start command, README and this implementation record. No dependencies or wire formats changed.

Remaining: real administrator enrollment/key backup, isolated Supabase targets for legacy destructive suites, browser/staging evidence and the existing BE-02B/BE-02C correctness gaps. Exact Origin enforcement is complete; full BE-02 acceptance is still outstanding.

## Previous completed task: SEC-02 administrator MFA

Implemented without changing the login/MFA JSON contract:

- Six-digit RFC 6238 HMAC-SHA1 codes, 30-second steps, a random 20-byte secret and at most one adjacent step in either direction. Unit tests match all six published SHA1 vectors reduced to the required six digits.
- AES-256-GCM encrypted secrets with fresh nonces and authenticated school/admin/enrollment-version binding. No plaintext or fixed-secret fallback remains. Startup validates the server-only `MFA_ENCRYPTION_KEY`; a private key was generated in the ignored backend `.env` without being printed or committed.
- Five-minute challenges; verification rechecks challenge expiry, active school/admin and enrollment after database locks. A dedicated challenge guard allows unfinished MFA only at the existing verification route and rejects revoked/absent/non-challenge sessions with 401 before CSRF validation.
- Durable account-level verification limits: five failures within five minutes across all challenges/process restarts, then 429 `RATE_LIMITED` with `Retry-After`. Malformed/reused codes cannot grant access. Successful-step consumption, challenge revocation, verified-session creation and audit commit atomically under the account lock; concurrent requests cannot consume a step twice. Forced failure rolls back the whole escalation.
- Protected operator commands for first-school/first-admin bootstrap, enrollment, confirmation and lost-authenticator recovery. They require migration credentials and a private interactive terminal with support-contact identity verification. Account activation requires a valid TOTP; recovery disables the account, revokes all auth/challenge sessions, rotates the secret and requires proof before reactivation. Operator/admin/reason are audited. Initial passwords and enrollment material appear only in the protected terminal. Full commands/private delivery instructions are in [README](../README.md#administrator-mfa).
- Migration `008_admin_mfa.sql` is applied on Supabase, adding enrollment/limiter fields and tenant-scoped successful-step history. It retired unverified legacy plaintext MFA, disabled legacy administrators and revoked their sessions. Real administrators now require protected enrollment; none were enrolled impersonally during this task. Synthetic seed administrators also start inactive without a shared MFA secret.

Verification: **19 live Supabase MFA cases pass**, covering valid/invalid/boundary codes, repeated steps, same/different-challenge concurrency, limiter restart persistence, atomic rollback, corrupt-secret denial, private enrollment, recovery, wrong-school/unprivileged provisioning, atomic first-admin bootstrap and enrollment expiry/lockout. The CLI separately refused noninteractive enrollment before account access. Backend compilation and root `npm run check` pass (10 frontend tests). The complete selected run passes **63 tests across five files**: 19 live MFA, 13 live tenant-isolation and 31 unit cases. Its two synthetic MFA schools, bootstrap school and isolated accounts/sessions were cleaned up; legacy application records were not reset. Supabase records migration 008 with no pending migrations, and the runtime remains `nexora_runtime` with no RLS bypass.

New files: migration 008, [MFA crypto helper](../src/common/crypto/mfa.ts), [verification transaction](../src/modules/auth/mfa-verification.ts), [operator operations](../src/modules/auth/mfa-operator.ts), [protected CLI](../scripts/mfa-operator.ts), [MFA unit vectors](../test/unit/mfa.spec.ts), [Supabase MFA suite](../test/admin-mfa.e2e-spec.ts). Modified: auth service/controller, session guard, DB authentication transaction helper, synthetic seed, isolation fixtures, package script, environment example, README and this implementation record. No dependencies changed.

Remaining: real operator-assisted administrator enrollment and private key backup/deployment configuration, exact Origin enforcement, broader frontend/browser evidence, and the existing save/submit/recovery/transfer gaps. Legacy destructive seed/reset suites remain blocked from this Supabase application database and need an isolated Supabase target plus protected synthetic enrollment fixtures before they can run. This completes the MFA implementation slice, not full BE-02 acceptance.

## Previous completed task: SEC-01 restricted runtime and tenant isolation

Implemented and applied on Supabase:

- Migration `006_restricted_runtime.sql` creates a restricted runtime role, enables/forces RLS on all application tables, replaces the legacy tenant policies and removes publishable-key Data API access to application tables. `app.is_migration_or_admin` no longer bypasses tenant policies. The migration ledger is inaccessible to the runtime role.
- Migration `007_school_membership_locks.sql` supplies the tenant-scoped school UPDATE permission/policy needed by existing membership `FOR SHARE` locks. The first live enrollment test identified this missing permission; its regression now passes.
- `db:provision-runtime` generates a private runtime password and replaces only `DATABASE_URL` in the ignored backend `.env` with permissions 0600. The existing administrative `MIGRATION_DATABASE_URL` remains unchanged. The provisioning command refuses implicit password rotation.
- The running API uses `nexora_runtime`, with no superuser, RLS-bypass, database-creation or role-creation privileges. Startup rejects privileged, schema-creation, table-owner or elevated-membership runtime credentials; this rejection is verified against the actual migration connection.
- Authentication uses transaction-local login-ID or hashed-cookie lookup context before a school is known. Session restoration, anonymous CSRF bootstrap, login, enrollment and logout work with the restricted connection. Inactive-school login is rejected. Existing standalone submission/recovery/receipt and idempotency queries now enter tenant context explicitly.
- Tenant and authentication contexts are transaction-local and separate. Unscoped SQL returns no tenant rows. Shared browser credentials remain global to the backend role; verified student enrollment/ownership remains tenant-scoped. This preserves the shared-browser model without exposing the registry to browser Data API roles.

Verification: **13 live Supabase isolation tests and 21 backend unit tests pass**, backend compilation passes, and root `npm run check` passes (10 frontend tests). The new opt-in suite creates randomly identified schools/accounts, tests both schools/all roles (including denial before admin MFA), cross-school reads/writes, the disabled bypass, transaction-context cleanup, denied DDL/role escalation, bootstrap-table Data API permissions and restricted-role login/device/logout. Cleanup removes only this suite's own synthetic school/account/device/session records. No local database or legacy seed/reset suite was used.

Command: `RUN_SUPABASE_ISOLATION_TESTS=true npm run test -- test/tenant-isolation.e2e-spec.ts test/unit` from the backend directory. This is focused real-database evidence, not full student-runner/browser/BE-02 acceptance. The legacy destructive suites remain guarded and require a separate isolated Supabase target before use. Full MFA/operator provisioning, exact Origin enforcement and the previously identified save/submit/recovery/transfer gaps remain open.

New files: migrations 006/007, [runtime provisioning script](../scripts/provision-runtime.ts), [Supabase isolation suite](../test/tenant-isolation.e2e-spec.ts). Modified: DB service and idempotency service, session guard, auth service, delivery service, database-status script, backend package scripts, README and this implementation record. No dependencies changed; no credentials are tracked.

## Previous completed task: DB-01 Supabase configuration

Supabase is the database for ongoing backend development, application data and migrations. The private backend `.env` is ignored by Git. Both `DATABASE_URL` and `MIGRATION_DATABASE_URL` now connect successfully to the intended Supabase project through its Session pooler on port 5432. No credentials are included in this report.

Implemented: a shared, validated backend environment loader; explicit runtime/migration connections with no silent localhost fallback; single-connection, transaction-locked migration execution; a read-only `db:status` command; a secret-free backend environment example and [setup instructions](../README.md). Startup, migrations and seeds use the same backend `.env`, including commands launched from the repository root. Migration/admin session settings are transaction-local.

Verified against Supabase: inspected the existing five migration records before applying only `005_browser_device_credentials.sql`. Both connections subsequently report six recorded SQL migrations, the new `browser_devices` table and no pending migrations. No seed was run or existing application data reset. The running backend's `GET /api/v1/ready` returned HTTP 200 with `status: ready` and `database: connected`.

Fixed the startup prerequisite exposed by this check: `tsx watch` did not emit constructor metadata, so NestJS started with missing dependencies and readiness returned 503. Development startup now compiles with TypeScript first and runs the actual `dist/src/main.js` output; the production start path and CommonJS cookie-parser import are corrected too. Restart `start:dev` after source edits; it no longer watches for changes. Root ESLint now excludes nested generated `dist` directories as well as the frontend build directory, so compiling the backend does not make the repository check lint generated JavaScript.

Backend compilation, root `npm run check` (10 frontend tests) and 21 backend unit tests pass, including 14 database-configuration tests. The previously reported 81-test integration result below remains the earlier local PostgreSQL verification; it is not a Supabase result. No local database was used by DB-01. Existing destructive test guards remain in place until a separately isolated Supabase test target is configured.

At DB-01 completion, the runtime connection still used the privileged migration role. SEC-01 above subsequently separated these credentials and verified focused runtime isolation/bootstrap behavior. Full BE-02A MFA/operator provisioning remains incomplete. Neither setup task marks BE-02 accepted.

## Latest completed task: BE-02A preparation repairs

Implemented and verified:

- Assigned list/detail now return the exact required `deadlineAt`, `scheduleRevision`, nullable `attemptId` and independent attempt state. Limits and scoped cursors are validated, and lists paginate beyond 25 records.
- Browser enrollment is student-only and requires the existing credential before reusing an ID. Credentials have a 30-day server expiry/revocation record; only hashes are stored. Valid shared browsers can enroll another authenticated student without granting access to another student's attempt. Production uses `__Host-nexora_device`, Secure, HttpOnly, SameSite=Lax and Path=/.
- Migration **005_browser_device_credentials.sql** adds the shared browser registry and preserves existing enrollment/evidence rows. Legacy IDs with conflicting hashes are revoked; expired/ambiguous browsers require a fresh ID and staff transfer for existing attempts. This migration was applied only to the disposable local database during this task.
- Active attempt retrieval, package access and unlock enforce ownership, admitted roster membership, current credential/binding and expiry. Unlock validates package/version/schedule/generation and refuses terminal/recovery states. Its deadline is checked after waiting for locks; late entry and repeat unlock retain the original personal deadline.
- Attempt creation requires a UUID idempotency key. Transactional locks serialize same-key and different-key first requests into one attempt. Identical retries replay the original response after deadline/restart, with current eligibility/device checks. A new key retrieves the existing attempt's current receipt/recovery state rather than returning false nulls.
- Session restoration now rejects inactive students/schools. The existing recovery-decision SQL now joins `exam_sessions` for `exam_version_id`, fixing the baseline schema defect without claiming full BE-06 completion.
- Existing lint, formatting and TypeScript failures were repaired without dependency upgrades or weaker assertions. Seed-dependent suites run sequentially because they share synthetic accounts; explicit concurrency regressions still use independent requests. DB suites now refuse any database other than localhost `nexora_be02a_test`. The broken `test:e2e` command points to the actual suite files.
- Migration/seed/startup output uses the existing Nest logger; seed no longer prints passwords/MFA material. Generic server exceptions retain the safe generic response. Embedded live configuration in the handover guide was replaced with placeholders; operator-managed credential rotation and history cleanup were not performed.

| Audit finding | Current status |
| --- | --- |
| G01: assigned response mismatch | Fixed and verified. |
| G02: browser credential takeover/expiry/role | Fixed and verified, including shared browsers and production cookie attributes. |
| G03: preparation binding/package/version/state checks | Fixed and verified, including barred roster membership and deadline lock contention. |
| G04: attempt creation idempotency/concurrency/reconciliation | Fixed and verified, including restart and complete receipt/recovery metadata. |
| G05: recovery decision schema defect | Fixed; existing accept/transfer regression suite passes. Full BE-06 revision/evidence work remains. |
| G08: validation timing | Unlock and preparation timing fixed. Save/submit/transfer timing remains outstanding. |
| G12: administrator MFA | SEC-02 implements encrypted secrets, five-minute challenges, durable limiter/step consumption and protected operator provisioning/recovery; 19 live MFA cases pass. Actual administrator enrollment remains a private operator action. |
| G14: exact Origin checks | SEC-03 replaces CORS/CSRF prefix matching with a shared exact allowlist, requires Origin on mutations and removes Referer fallback. Live Supabase and configuration regressions cover rejection and permitted flows. |
| G13: membership and RLS | Active membership/preparation repairs complete; SEC-01 subsequently added restricted-role auth/bootstrap and live Supabase tenant-isolation verification. Full workflow/browser evidence remains outstanding. |
| G15: validation/errors | Preparation requests/pagination and generic error response improved. Validation of other mutations remains outstanding. |
| Other baseline findings | Still open unless explicitly stated above. |

New files: [browser credential helper](../src/common/crypto/device-credential.ts), [migration 005](../migrations/005_browser_device_credentials.sql), [preparation schemas](../src/modules/delivery/preparation-schemas.ts), [preparation service](../src/modules/delivery/preparation.service.ts), [HTTP test helpers](../test/http-helpers.ts), [41-case PostgreSQL regression suite](../test/preparation-regressions.e2e-spec.ts).

Files modified for this task: backend auth service/controller; delivery service/controller/module; session/device guards; DB/idempotency typing; exception handling; startup/migration/seed logging; existing BE-02A/B/C tests and fixture; crypto/clock test; backend package test script; Vitest configuration; this status document. Existing backend files flagged by Prettier, including the handover guide, were formatted as part of the approved validation repairs. Dependency manifests/lockfiles retain their existing dependency versions.

## Status overview

| Area | Status | Implemented in code | Work remaining |
| --- | --- | --- | --- |
| Foundation / operations | Partial | NestJS application, `/api/v1`, Supabase PostgreSQL service, migrations through 008, restricted runtime role, focused RLS/bootstrap verification, clock, crypto, MFA/operator provisioning, exact Origin/CORS enforcement, error/response handling and DB readiness route. | Remaining validation/error repairs, real deployment provisioning and deployment evidence. |
| BE-02A: auth and preparation | Partial | Cookie sessions, exact Origin/CSRF checks, password login, encrypted admin TOTP with durable limiting/replay protection, protected operator bootstrap/enrollment/recovery, logout, device registration, assigned exams, attempt creation/retrieval, encrypted package, timed unlock, restricted-role auth/bootstrap. | Preparation, focused runtime isolation, MFA and exact Origin implementation slices are complete. Remaining acceptance includes real private administrator enrollment and real browser/staging verification. |
| BE-02B: saves and final receipt | Partial | Row-locked saves, revision history, complete-snapshot validation, deterministic objective grading, atomic submission/result writes, digest and receipt reads/replay logic. | Cross-item sequence uniqueness, correct validation/arrival timing, device-expiry replay exception, stronger validation and concurrency evidence. |
| BE-02C: recovery and transfer | Partial | Late evidence upload, decision/transfer handlers, receipt correlation, audit/replay code, sequence-zero answer inheritance. | Recovery decision SQL is fixed. Replay/concurrency gaps, BE-09 transfer contract, recovery evidence and result revisions remain. |
| BE-03: teacher preparation | Schema groundwork only; API missing | Exam/version/item/topic tables and import/AI job tables; synthetic approved paper seed. | Teaching assignments API, drafts, real DOCX/XLSX import, AI workers, item review and submit-for-approval. |
| BE-04: admin approval and scheduling | Schema/seed groundwork only; API missing | Session/roster/package tables; seed creates approved content and schedules directly. | Admin review/return/approval, durable package generation/retry, schedule creation/rescheduling and frozen-roster gates. |
| BE-05: official results and publication | Partial internals; all reporting/publication endpoints missing | Normal submission computes score and writes `official_results`; result/publication tables exist. | Sitting-wide revisions, ranks, analytics, publication/exclusions, student released results and full exports. |
| BE-06: recovery review | Partial | Existing BE-02 upload/decision code and recovery records. | Admin queue/detail, immutable timely-save evidence and publication revision integration; baseline decision SQL is now fixed. |
| BE-07: practice | Schema groundwork only; API missing | Practice access/attempt/answer/summary tables. | Release gates, repeated attempts, first-answer feedback, completion/best score, official/practice isolation and scheduling interlock. |
| BE-08: school setup/accounts | Schema groundwork only; API missing | Users/classes/subjects/enrollments/assignments tables, password helpers and seed accounts. | Directory CRUD/audit, CSV preview/commit, one-time credential issuance, audited reset and session revocation. |
| BE-09: monitoring/device replacement | Partial legacy transfer; monitor API missing | Original BE-02 transfer handler preserves deadlines and inherits saved answers. | Three monitor reads, contact/history persistence, revised transfer request/response, concurrency precondition and readiness fields. |
| BE-10: accommodations | Partial deadline calculation; management API missing | Roster `extra_time_minutes`; attempt deadline adds allowance, final acceptance adds five seconds; seed includes a 15-minute allowance. | Admin roster/read/edit, freeze/revision/audit/replay rules, `latestDeadlineAt` and downstream publication/practice/overlap gates. |
| BE-11: preparation readiness | Missing | No readiness route, persistence or monitor representation found. | Version/device-bound acknowledgement, durable replay/history, invalidation and `readyCount`/`readiness` monitor extensions. |

“Partial” means useful implementation exists but known requirements remain. “Schema groundwork only” does not mean the workflow is usable. No full BE increment is marked accepted by this audit.

## Sources used

- Latest [API contract v0.12](Nexora_Backend_BE11_v0.12/docs/api-contract.md), [handoff](Nexora_Backend_BE11_v0.12/docs/backend-handoff.md), [BE-02 task](Nexora_Backend_BE11_v0.12/docs/backend-student-exam-task.md) and [exam engine](Nexora_Backend_BE11_v0.12/docs/exam-engine.md).
- BE-03 through BE-11 task documents linked in the remaining-work sections below.
- Latest [student schemas](Nexora_Backend_BE11_v0.12/src/features/exams/schemas.ts), [readiness schemas](Nexora_Backend_BE11_v0.12/src/features/exams/readiness.ts) and [monitor schemas](Nexora_Backend_BE11_v0.12/src/features/exams/monitor/schemas.ts).
- The BE-11 bundle does not contain every older executable interface. Unchanged authoring/results/recovery/practice/school API references were read from [BE-09](Nexora_Backend_BE09_v0.10/src/features/); revised admin/accommodation references from [BE-10](Nexora_Backend_BE10_v0.11/src/features/exams/admin/).

Later addenda explicitly supersede earlier requirements. In particular, BE-09 revises device transfer; BE-10 issues accommodation editing; BE-11 issues readiness. Historical paragraphs saying these interfaces are still pending do not describe the latest handoff.

The older [backend handover guide](../NEXORA_BACKEND_HANDOVER_GUIDE.md) is not reliable as a completion checklist: some table names, future endpoint examples and task numbering differ from the supplied contracts and actual migrations. Its claims about the deployed Supabase schema and previous acceptance remain historical; current local verification is reported below. Its embedded live configuration has now been replaced with placeholders. Previously shared credentials still require operator-managed rotation; no live values have been copied into this report.

## What is already implemented

### Foundation

- [Application wiring](../src/app.module.ts) registers exactly three modules: operations, authentication and delivery. The API prefix is set in [main.ts](../src/main.ts).
- [DbService](../src/common/db/db.service.ts) provides pooled queries, transactions, rollback and tenant transactions using `app.current_school_id`.
- [Migrations](../migrations/) define tenant-scoped entities, composite ownership constraints, unique attempts/submissions, revision history, recovery, results and future-work tables. Many tenant tables have enabled/forced RLS. Presence of these SQL files does not prove the deployed role or database schema is correct.
- [ClockService](../src/common/clock/clock.service.ts) supports injectable test time without a public clock-override endpoint.
- [Package cipher](../src/common/crypto/package-cipher.ts) implements AES-256-GCM with a random 12-byte nonce, appended authentication tag, base64url transport and ciphertext SHA-256.
- [Canonical digest](../src/common/crypto/canonical-digest.ts) builds the `nexora-final-v1` sorted-answer tuple and SHA-256 digest. Unit tests compare it and package decryption with the supplied interoperability fixture.
- [Password helpers](../src/common/crypto/password.ts) implement Argon2id hashing/verification and random token/password helpers.
- [Response headers](../src/common/interceptors/response-headers.interceptor.ts) and [exception handling](../src/common/errors/global-exception.filter.ts) provide request IDs, private/no-store headers and structured errors, with limitations listed below.
- [Migration script](../scripts/migrate.ts) tracks applied filenames and executes unapplied migrations transactionally. [Seed script](../scripts/seed-staging.ts) creates synthetic users in two schools and an approved ten-question, 20-mark paper with an explicitly answer-free student package. This bypasses authoring/approval workflows for integration setup; it does not implement them.

### Existing HTTP endpoints

All paths below have prefix `/api/v1`. “Present” means the controller and service implementation exist; the limitations column and gap register still apply.

| Method/path | Present behavior | Limitation |
| --- | --- | --- |
| `GET /health` | Liveness and server time. | No live deployment verified. |
| `GET /ready` | Runs `SELECT 1` and reports database availability. | Does not verify schema revision, private storage or restricted-role permissions. |
| `GET /auth/csrf` | Anonymous/session CSRF bootstrap. | Shared auth/Origin limitations below. |
| `POST /auth/login` | Argon2 verification, token/CSRF rotation, admin challenge. | No login rate limiter found. |
| `POST /auth/mfa/verify` | TOTP verification and authenticated session creation. | MFA protections are incomplete. |
| `GET /auth/me` | Current identity, school, CSRF and server time. | Inactive users/schools now rejected; full MFA/RLS bootstrap acceptance remains. |
| `POST /auth/logout` | Session revocation and cookie clearing; 204. | Present; logout itself was not exercised by the current suites. |
| `POST /auth/device` | Hashes browser credential and persists device enrollment. | Credential possession, expiry/revocation, student role and production cookie verified. |
| `GET /me/exams` | Roster-scoped list and time-derived phase. | Exact fields, validated/scoped pagination and accommodated phases verified. |
| `GET /me/exams/:sessionId` | Assigned detail without creating an attempt. | Exact fields and read-only behavior verified. |
| `POST /sessions/:sessionId/attempts` | Creates/retrieves a unique bound attempt, persists deadline/order. | UUID keys, exact replay, current-state retrieval and one-attempt concurrency verified. |
| `GET /attempts/:attemptId` | State, server answers, receipt and recovery reconciliation. | Current bound browser and admitted roster enforced; receipt-only read remains separate. |
| `GET /attempts/:attemptId/package` | Encrypted package with preparation/deadline checks. | Current binding, eligibility, approved version, state and time checked. |
| `POST /attempts/:attemptId/unlock` | Time gate, generation comparison, key/orders, preparing-to-active transition. | Strict identity/revision/state checks and deadline after lock wait verified. |
| `POST /attempts/:attemptId/answers` | Transactional saves, same-item replay/conflict history, superseded entries. | Cross-item sequence reuse and validation-time gaps. |
| `POST /attempts/:attemptId/submit` | Complete snapshot validation, grading, atomic receipt/result, replay logic. | Guard blocks device-expiry replay exception; arrival-time and race evidence incomplete. |
| `GET /attempts/:attemptId/receipt` | Owner-scoped receipt/recovery read with correlation fields; no device guard. | Correct shape is present; persistence/restart acceptance unverified. |
| `POST /attempts/:attemptId/recovery` | Late immutable snapshot upload and recovery-pending state. | Reason omitted from replay fingerprint; evidence/concurrency gaps. |
| `POST /recovery/:recoveryId/decision` | Accept/reject transaction code, scoring/receipt/audit and competing-upload settlement. | Baseline SQL fixed; later sitting-wide revision/evidence requirements remain. |
| `POST /attempts/:attemptId/device-transfer` | Admin transfer, generation increment, inherited sequence-zero answers and replay record. | Still uses old BE-02 wire shape; BE-09 requirements incomplete. |

Preparation is now implemented in [preparation service](../src/modules/delivery/preparation.service.ts). Other endpoint evidence: [operations controller](../src/modules/operations/operations.controller.ts), [auth controller](../src/modules/auth/auth.controller.ts), [auth service](../src/modules/auth/auth.service.ts), [delivery controller](../src/modules/delivery/delivery.controller.ts), [delivery service](../src/modules/delivery/delivery.service.ts).

## Baseline findings and remaining gaps

The rows below preserve the initial audit findings and baseline line references. **Resolved or partially resolved findings are identified in the current-status table above; their historical descriptions below are not current defects.** Remaining rows still identify outstanding work. Preparation methods moved into the new preparation service, so old delivery-service line references are historical.

| ID | Finding and impact | Code evidence / required behavior |
| --- | --- | --- |
| G01 | **Assigned-exam responses do not match the frontend.** They return `studentDeadline` instead of `deadlineAt` and omit `scheduleRevision` and nullable `attemptId`. The supplied frontend schema requires all three. | `getMyExams` and `getMyExamDetail`, [delivery service](../src/modules/delivery/delivery.service.ts), lines 29–197; [student schema](Nexora_Backend_BE11_v0.12/src/features/exams/schemas.ts). |
| G02 | **Device registration permits replacement of an existing credential without proving possession.** Its upsert replaces `credential_hash`. The endpoint also lacks the required student-only role restriction, issues a one-year cookie rather than 30 days and has no persisted expiry/revocation fields. | `registerDevice`, [auth service](../src/modules/auth/auth.service.ts), lines 262–322; [auth controller](../src/modules/auth/auth.controller.ts); [migration 001](../migrations/001_tenants_auth_and_rls.sql). BE-02 section 5 requires `DEVICE_REPLACED` for reused IDs without a valid credential, including the specified production host-only cookie. |
| G03 | **Active retrieval, package and unlock do not enforce current browser credentials.** Unlock checks only the supplied generation and time; it ignores supplied package ID, exam version and schedule revision, and does not reject submitted/invalidated states before returning a key. | `getAttempt`, `getPackage`, `unlockAttempt`, [delivery service](../src/modules/delivery/delivery.service.ts), lines 384–581. [Controller](../src/modules/delivery/delivery.controller.ts) applies `DeviceBindingGuard` only to answers and submit. |
| G04 | **Attempt creation lacks required request idempotency.** The controller does not read `Idempotency-Key`; uniqueness prevents duplicate rows but concurrent first inserts have no conflict-to-existing handling. Existing-attempt responses always return `receipt: null` and `recovery: null`, including finalized/recovery attempts. | `createOrGetAttempt`, [delivery service](../src/modules/delivery/delivery.service.ts), lines 198–382; [migration 003](../migrations/003_sessions_and_delivery.sql). BE-02 requires durable key/payload handling and truthful reconciliation. |
| G05 | **Recovery decisions cannot run against the checked-in schema.** The query selects `a.exam_version_id` from `attempts`, but that column exists on `exam_sessions`, not `attempts`. Both accept and reject enter this query. | `decideRecovery`, [delivery service](../src/modules/delivery/delivery.service.ts), line 1408; `attempts` definition in [migration 003](../migrations/003_sessions_and_delivery.sql), line 38. No corrective migration was found. |
| G06 | **Transfer still implements the superseded contract.** `TransferDeviceDto` lacks `expectedDeviceGeneration`; there is no expected-generation or same-device rejection. Response omits `deadlineAt`, `transferredAt`, `transferId`; audit lacks structured from/to generations and device history. | `transferDevice` and `TransferDeviceDto`, [delivery service](../src/modules/delivery/delivery.service.ts), lines 1612–1786. [BE-09](Nexora_Backend_BE11_v0.12/docs/backend-monitor-task.md) explicitly requires the revised shape and one atomic audited effect. |
| G07 | **Save sequences are enforced per item, not across the generation.** The same positive `clientSeq` can be used for different items. Both lookup and unique constraint include `item_id`. | `saveAnswers`, [delivery service](../src/modules/delivery/delivery.service.ts), lines 688–770; `uq_revision_seq` in [migration 003](../migrations/003_sessions_and_delivery.sql). BE-02 section 7 requires generation-wide sequence identity. |
| G08 | **Timing is captured at the wrong point for some operations.** Saves capture time before waiting for the attempt lock instead of checking validation time under the lock. Submit captures arrival only inside the service, after DB-backed auth/device guards, so a timely complete body could be judged late after guard delays. Unlock/transfer also capture time before lock acquisition. | `saveAnswers`, `submitAttempt`, `unlockAttempt`, `transferDevice`, [delivery service](../src/modules/delivery/delivery.service.ts); [device guard](../src/common/guards/device-binding.guard.ts). Boundary/lock-contention tests are still required. |
| G09 | **Committed submit replay can be blocked by an expired/missing device credential.** The route's device guard runs before the service's receipt replay branch. | [Delivery controller](../src/modules/delivery/delivery.controller.ts), lines 108–121; [device guard](../src/common/guards/device-binding.guard.ts). BE-02 permits owner-authenticated identical committed replay after device expiry/replacement. |
| G10 | **Replay handling has payload and concurrency holes.** Recovery upload compares only snapshot digest, so changed `reason` under the same key is not rejected; after a decision, replay returns the current status instead of the original upload response. Recovery/transfer/decision check replay before the operation lock without rechecking after a concurrent first request commits. A concurrent identical transfer can increment twice; a concurrent upload/decision may error instead of replaying. | `uploadRecovery`, `decideRecovery`, `transferDevice`, [delivery service](../src/modules/delivery/delivery.service.ts), lines 1148–1743. UUID keys are only checked for presence, and submission/recovery tables use globally unique keys rather than the documented scope. Needs real concurrency verification. |
| G11 | **Recovery lacks the full immutable review record and result revision behavior.** Upload does not snapshot current generation and latest timely saves. Acceptance hard-codes revision 1 and can upsert an existing result; it does not create a sitting-wide candidate, preserve approved publication snapshots or check invalidation explicitly. | [Recovery table](../migrations/003_sessions_and_delivery.sql), [results table](../migrations/004_results_practice_jobs.sql), `uploadRecovery`/`decideRecovery` in [delivery service](../src/modules/delivery/delivery.service.ts). BE-05/06 require these behaviors. |
| G12 | **MFA is incomplete.** Challenge lifetime is 15 minutes instead of five; verification uses `mfa_secret_enc` directly with a hard-coded fallback. No consumed-TOTP-step tracking, verification rate limiter, encrypted-secret implementation or protected enrollment/recovery command was found. | [Auth service](../src/modules/auth/auth.service.ts), lines 18, 168–239; [migration 001](../migrations/001_tenants_auth_and_rls.sql); available [scripts](../scripts/). BE-02 section 9 defines these requirements. |
| G13 | **Active membership and tenant isolation are not fully established.** Session guard never checks current `users.status` or `schools.status`. Many reads/auth/device operations use `db.query` without tenant context; a restricted RLS role cannot perform those tenant reads as written without an authorized bootstrap strategy. RLS policies also trust a custom bypass setting. No restricted-role creation/grants or verification were found. | [Session guard](../src/common/guards/session-auth.guard.ts), [DbService](../src/common/db/db.service.ts), [migration 001](../migrations/001_tenants_auth_and_rls.sql), [migration script](../scripts/migrate.ts). Actual deployed DB privileges were not inspected. |
| G14 | **Origin checks are not exact.** CORS and CSRF use `startsWith` against allowed origins. CSRF accepts missing Origin/Referer if its token is valid. This differs from the contract's required allowed Origin and exact allowlist. | [main.ts](../src/main.ts), line 24; [CSRF guard](../src/common/guards/csrf-origin.guard.ts), lines 42–61. |
| G15 | **Validation/error handling is incomplete.** Invalid list limits are clamped/parsed rather than consistently rejected; some malformed cursors are ignored. DTO interfaces do not provide runtime validation; several handlers do not reject extra fields or validate all IDs/version integers. Generic errors expose `exception.message` and are logged wholesale. | `getMyExams` and DTO checks in [delivery service](../src/modules/delivery/delivery.service.ts); [exception filter](../src/common/errors/global-exception.filter.ts). Contract requires safe errors and field validation. |
| G16 | **Result values are not BE-05-complete.** Percentages are rounded to two decimals and stored as `NUMERIC(5,2)`, while BE-05 requires unrounded percentages. Revision is per attempt/hard-coded 1 rather than the required sitting-wide snapshot. Rank/pass/topic/publication calculations are absent. | [Delivery service](../src/modules/delivery/delivery.service.ts), lines 1020, 1060–1068, 1464, 1501–1509; [migration 004](../migrations/004_results_practice_jobs.sql); [BE-05](Nexora_Backend_BE11_v0.12/docs/backend-results-task.md). |
| G17 | **Monitoring timestamps/readiness are not implemented.** No attempt `lastContactAt` persistence or readiness record exists. Normal submit updates `last_server_save_at` to receipt time, although BE-09 reserves it for ordinary accepted answer batches. | [Migration 003](../migrations/003_sessions_and_delivery.sql); `submitAttempt`, [delivery service](../src/modules/delivery/delivery.service.ts), lines 1047–1056; BE-09/11. |
| G18 | **Package generation is seed-only and the key is not wrapped at rest by application code.** The seed stores raw base64url key material in `key_enc`; unlock returns it directly. Rerunning seed replaces the package ciphertext/key for an existing version. No durable approved-package worker or shuffled-order generation was found. | [Seed script](../scripts/seed-staging.ts), lines 180–205; `unlockAttempt` and `createOrGetAttempt` in [delivery service](../src/modules/delivery/delivery.service.ts); BE-02/04. Treat seed as setup for disposable synthetic data, not an approval workflow. |

## Remaining endpoints and workflows

The inventory below comes from the issued task documents and executable frontend API references. No matching production controllers were found for these routes. Existing similarly named SQL tables do not serve them. Frontend sources inside handoff folders are reference material, not registered backend modules.

### BE-03 — teacher preparation

Spec: [backend-teacher-exam-task.md](Nexora_Backend_BE11_v0.12/docs/backend-teacher-exam-task.md).

- `GET /me/teaching-assignments`
- `GET /exams`, `GET /exams/:id`, `POST /exams`, `PATCH /exams/:id`
- `GET /exams/:id/items`, `PATCH /exams/:id/items`
- `POST /imports`, `GET /imports/:id`, `POST /imports/:id/ai-retry`
- `POST /exams/:id/submit-for-approval`

Remaining behavior: teacher/assignment authorization; revision-protected drafts; bounded real DOCX/XLSX parsing with diagnostics; private source storage; durable AI jobs/retry/provenance; reviewed-item gates; immutable submitted snapshots. Job tables alone do not provide parsing or real AI.

### BE-04 — approval, packages and scheduling

Spec: [backend-admin-exam-task.md](Nexora_Backend_BE11_v0.12/docs/backend-admin-exam-task.md).

- `GET /admin/exams`, `GET /admin/exams/:id`
- `POST /exams/:id/approve`, `POST /exams/:id/return`
- `POST /exams/:id/package-retry`
- `POST /exams/:id/sessions`, `PATCH /sessions/:id/schedule`

Remaining behavior: approval/return audit, frozen approved content, durable package jobs, active-student roster snapshots, exact ten-minute preparation, schedule overlaps, original-cutoff rescheduling and replay after cutoff. Apply BE-07 reuse restrictions and BE-10 accommodations/`latestDeadlineAt`. Seeded schedules do not establish this workflow.

### BE-05 — results, publication and exports

Spec: [backend-results-task.md](Nexora_Backend_BE11_v0.12/docs/backend-results-task.md).

- `GET /results/sessions`
- `GET /sessions/:id/results`, `GET /sessions/:id/analytics`
- `POST /sessions/:id/results-publication`
- `GET /me/results`
- `GET /exports/results.csv`, `GET /exports/report`

Remaining behavior: immutable sitting-wide revisions; competition ranks; unrounded marks/percent/pass calculations; whole-roster/topic aggregates; null scores for unresolved statuses; publication/time/accommodation/recovery gates; explicit exclusions; teacher assignment scope; full CSV with formula escaping and typed print report. Student results must include BE-07 practice metadata separately.

### BE-06 — recovery review

Spec: [backend-recovery-task.md](Nexora_Backend_BE11_v0.12/docs/backend-recovery-task.md).

- `GET /admin/recovery`
- `GET /admin/recovery/:recoveryId`
- Finish the existing `POST /recovery/:recoveryId/decision` rather than treating its route presence as acceptance.

Remaining behavior: immutable generation-at-upload/timely-save comparison, related uploads, acceptance blockers, complete audit/supersession, valid scoring query, original upload-key receipt correlation and new candidate revisions that leave released history unchanged.

### BE-07 — practice

Spec: [backend-practice-task.md](Nexora_Backend_BE11_v0.12/docs/backend-practice-task.md).

- `GET /admin/practice-exams`
- `GET /exams/:id/practice-access`, `POST /exams/:id/practice-access`
- `GET /me/practice`
- `POST /exams/:id/practice-attempts`
- `GET /practice-attempts/:id`
- `POST /practice-attempts/:id/answers`, `POST /practice-attempts/:id/complete`

Remaining behavior: explicit release/publication gates across all accommodated sittings, immutable first answers and per-item feedback, repeated attempts, atomic completed best scores, retained access history, official-data isolation and permanent prevention of official reuse after content release.

### BE-08 — school setup and accounts

Spec: [backend-school-task.md](Nexora_Backend_BE11_v0.12/docs/backend-school-task.md).

- `GET /classes`, `POST /classes`, `PATCH /classes/:id`
- `GET /subjects`, `POST /subjects`, `PATCH /subjects/:id`
- `GET /students`, `PATCH /students/:id`
- `GET /teachers`, `POST /teachers`, `PATCH /teachers/:id`
- `GET /teacher-assignments`, `POST /teacher-assignments`, `PATCH /teacher-assignments/:id`
- `GET /admin/directory-audit`
- `POST /students/import`, `POST /students/import/:id/commit`
- `POST /students/generate-credentials`
- `POST /students/:id/reset-password`, `POST /teachers/:id/reset-password`

Remaining behavior: revisions, archive dependencies, search/pagination, active account/assignment rules, atomic CSV preview/commit, unissued accounts, one-time credentials with metadata-only replay, password reset/session revocation and frozen-roster preservation. Existing `users.password_hash NOT NULL` and missing credential/revision/import-preview fields need reconciliation with the issued unissued-account workflow. Seed passwords are not credential-issuance implementation.

### BE-09 — monitor and revised device transfer

Spec: [backend-monitor-task.md](Nexora_Backend_BE11_v0.12/docs/backend-monitor-task.md).

- `GET /admin/monitor/sessions`
- `GET /admin/monitor/sessions/:sessionId`
- `GET /admin/monitor/attempts/:attemptId`
- Update existing `POST /attempts/:attemptId/device-transfer` to the required BE-09 body and response.

Remaining behavior: full frozen-roster status counts, truthful contact/save timestamps, preserved transfer history, expected-generation concurrency protection, valid device enrollment, exact replay and unchanged deadlines. Include BE-11 readiness fields. Do not add the frontend's private demo endpoints.

### BE-10 — extra-time accommodations

Spec: [backend-accommodations-task.md](Nexora_Backend_BE11_v0.12/docs/backend-accommodations-task.md).

- `GET /admin/sessions/:sessionId/accommodations`
- `PATCH /sessions/:sessionId/accommodations`

Remaining behavior: full roster read, revision-bound pagination, 0–480 minute allowance edits, reason/audit/history, original-preparation freeze, transactional conflicts/replay, `latestDeadlineAt` and `accommodation_changed`. Preserve approved allowances through rescheduling, student delivery, monitor, publication and practice.

### BE-11 — verified preparation acknowledgement

Spec: [backend-readiness-task.md](Nexora_Backend_BE11_v0.12/docs/backend-readiness-task.md).

- `POST /attempts/:attemptId/readiness`
- Extend all monitor responses with required `readyCount` and nullable attempt `readiness`.

Remaining behavior: strict package/checksum/version/generation/build validation, server acknowledgement identity/time, durable idempotency, atomic unlock/transfer/finalization serialization and device/version invalidation. Readiness reports must not become a gate to taking the exam or be inferred from package download.

## Verification and evidence limits

Verified on Node `v24.18.0`, npm `11.16.0`, using locked dependencies restored with `npm ci`; no package version or dependency changes. PostgreSQL ran in a disposable `pgvector/pgvector:pg17` container bound to `127.0.0.1:55439`, database `nexora_be02a_test`. All migration/seed/test commands explicitly selected this local database. No application database or staging API was modified.

| Check | Actual result |
| --- | --- |
| Root `npm run check` | PASS: TypeScript, ESLint, Prettier and 10 frontend tests. |
| Backend `npm run build -- --noEmit --incremental false` | PASS. |
| Backend `DATABASE_URL=postgresql://postgres@127.0.0.1:55439/nexora_be02a_test NODE_ENV=test npm run test` | PASS: 81 tests across 5 files. |
| Fresh migrations 001–005 | PASS in disposable PostgreSQL. |
| Legacy migration 005 behavior | PASS: shared hashes retained, ambiguous credentials revoked, expired timestamps preserved, enrollment rows retained. |
| Whitespace and local document references | Checked separately before commit. |

DB suites now guard against accidental use of a configured remote database. Their synthetic cleanup is permitted only in this disposable local database. New concurrency tests issue independent requests; restart replay closes and rebuilds the Nest application while retaining the database.

| Test file | Cases | Result |
| --- | --- | --- |
| [preparation-regressions.e2e-spec.ts](../test/preparation-regressions.e2e-spec.ts) | 41 | PASS: schemas, pagination, eligibility, credentials, shared browsers, expiry/revocation, concurrency, exact replay/restart, personal deadlines, package/unlock validation, production cookie and legacy migration. |
| [be02a-preparation.e2e-spec.ts](../test/be02a-preparation.e2e-spec.ts) | 11 | PASS. |
| [be02b-runner-submit.e2e-spec.ts](../test/be02b-runner-submit.e2e-spec.ts) | 11 | PASS. |
| [be02c-recovery-transfer.e2e-spec.ts](../test/be02c-recovery-transfer.e2e-spec.ts) | 11 | PASS against the existing BE-02 transfer behavior; not BE-09 acceptance. |
| [crypto-and-clock.spec.ts](../test/unit/crypto-and-clock.spec.ts) | 7 | PASS, including supplied digest/encryption interoperability vectors. |

Exact root check output:

```text
> exam-frontend@0.0.0 check
> npm run typecheck && npm run lint && npm run format:check && npm run test


> exam-frontend@0.0.0 typecheck
> tsc -b


> exam-frontend@0.0.0 lint
> eslint . --max-warnings 0


> exam-frontend@0.0.0 format:check
> prettier --check .

Checking formatting...
All matched files use Prettier code style!

> exam-frontend@0.0.0 test
> vitest run


 RUN  v4.1.11 /home/yonas/Desktop/coding/nexora/digital-exam/Nexora-Online-Examination


 Test Files  5 passed (5)
      Tests  10 passed (10)
   Start at  13:28:54
   Duration  3.87s (transform 670ms, setup 1.57s, import 2.94s, tests 2.17s, environment 8.74s)
```

Exact backend test output:

```text
> nexora-backend@1.0.0 test
> vitest run


 RUN  v3.2.7 /home/yonas/Desktop/coding/nexora/digital-exam/Nexora-Online-Examination/nexora-backend

 ✓ test/preparation-regressions.e2e-spec.ts (41 tests) 5659ms
   ✓ BE-02A preparation regressions (disposable PostgreSQL) > paginates beyond 25 and rejects malformed or foreign cursors  352ms
 ✓ test/be02a-preparation.e2e-spec.ts (11 tests) 610ms
 ✓ test/be02c-recovery-transfer.e2e-spec.ts (11 tests) 901ms
 ✓ test/be02b-runner-submit.e2e-spec.ts (11 tests) 737ms
 ✓ test/unit/crypto-and-clock.spec.ts (7 tests) 284ms

 Test Files  5 passed (5)
      Tests  81 passed (81)
   Start at  13:30:40
   Duration  12.95s (transform 406ms, setup 0ms, collect 2.98s, tests 8.19s, environment 2ms, prepare 515ms)
```

These results cover the listed repairs. DB tests used the local privileged test account; they do not establish restricted-runtime-role/RLS auth bootstrap. Full save/submit/transfer/recovery/publication race, rollback and retention acceptance remains outstanding. No real integrated browser/offline journey, staging deployment, restore/rollback exercise or 500-student load result is claimed.

The seed still does not provide the complete requested ended/submitted/recovery fixture set or all directory/assignment scenarios. It retains existing schedule timestamps on reruns; it is not a fresh complete acceptance environment. No backend feature tests for the still-missing BE-03 through BE-11 workflows were added in this task.

## Completion checklist for future backend work

- [x] Close G01–G05 preparation/schema defects with local PostgreSQL regressions.
- [ ] Close remaining and partially resolved findings, including full MFA/RLS prerequisites, and prove BE-02 with the real frontend.
- [ ] Complete BE-03 teacher drafts/import/AI/review.
- [ ] Complete BE-04 approval/packages/scheduling.
- [ ] Complete BE-05 official result revisions/publication/exports.
- [ ] Complete BE-06 recovery review and result-revision integration.
- [ ] Complete BE-07 practice and official-content reuse interlock.
- [ ] Complete BE-08 school/account administration and credentials.
- [ ] Complete BE-09 monitoring and revised transfer.
- [ ] Complete BE-10 accommodation management and downstream gates.
- [ ] Complete BE-11 readiness acknowledgement and monitor extensions.
- [ ] Provide staging/origin/migration/runtime-role evidence and the mandatory real-database/browser reports.

This checklist records current remaining scope. The completed preparation repairs above do not mark the entire BE-02 increment or any later workflow production-accepted.
