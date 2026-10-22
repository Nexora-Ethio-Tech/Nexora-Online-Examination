# Backend handoff

## Immediate approved package preparation — 18 October 2026

Approval now prepares the student artifact in the request transaction, with savepoint-isolated failures preserving the immutable approval. Existing pending papers gain an immediate prepare action through the extended package-retry endpoint; active leases and ready artifacts remain protected. Worker entry points prioritize packages before AI. See [behavior, deployment and verification](package-preparation.md). No new migration or hosted deployment is included, and real hosted timing/queue acceptance is not claimed.

## School-controlled AI exam generation — 18 October 2026

The owner requested a school-admin opt-in for teachers to generate entire draft papers alongside the existing upload workflow. Source now includes the school setting, teacher generation form, revision/idempotency and role/ownership gates, validated provider generation and durable worker processing. See [the contract and acceptance guide](backend-ai-exam-generation-task.md). Migration 020 and a configured worker are required. The source change has not been deployed, the migration has not been applied by this task, and no full-paper live-provider or hosted acceptance is claimed. Teacher review and administrator approval remain mandatory. Work stays on the current branch at the owner's explicit request.

## Backend integration in progress — 17 October 2026

The owner selected the existing frontend contracts as the implementation target, before the older handover guide's proposed essay or short-answer extensions. Work is on `feat/backend-frontend-integration`; this is not a completed backend acceptance report.

With explicit authorization, migrations 009–018 were applied to the configured Supabase database. These add supervision, monitor/readiness history, directory revisions, teacher authoring/import queues, approval/package jobs, scheduling/accommodations, immutable result snapshots, recovery comparison evidence practice audit/version fields and durable login/practice request counters. No hosted backend deployment or frontend production configuration change has been performed.

Implemented routes now cover the existing authoring, directory, approval, scheduling, accommodation, delivery, monitoring, official results, recovery-review and practice contracts. Results revisions and publication snapshots are separate; accepting recovery creates a new candidate without changing an older publication. Practice checks every related sitting and all frozen-roster deadlines, preserves first answers, and never changes official marks. New package release keys are wrapped with an authenticated envelope bound to school/version; the wrapping subkey is derived separately from the private MFA encryption key. Keep that master key backed up privately. Legacy unwrapped package keys remain readable for compatibility and require an operator migration before claiming all historical keys are wrapped.

The AI adapter supports `OPENAI_API_KEY`, `OPENAI_BASE_URL` and `OPENAI_MODEL`; see [AI configuration](../nexora-backend/docs/ai-provider-configuration.md). The English synthetic sample passed. **Amharic provider verification is explicitly deferred by the owner** after a truncated response and timeout. Durable worker tests use a deterministic test adapter and do not establish real-model quality. Worker invocation/hosting is described in [worker operations](../nexora-backend/docs/import-worker-operations.md); a hosted scheduler still must be configured.

See [integration testing](backend-integration-testing.md) for actual evidence and remaining acceptance. Broader transaction failure/race coverage, hosted routing, real offline/mobile journeys and deployment configuration remain separate from the passing scoped API tests. Historical uploads created before migration 016 cannot truthfully reconstruct generation-at-upload/timely comparison; the review endpoint returns an explicit operator-review conflict for those records instead of fabricating evidence. Historical papers lacking a verified assignment/reviewed approved content need operator reconciliation before using the new authoring/admin contracts.

## UI simplification — 16 October 2026

The follow-up on feat/quiet-sharp-ui sharpens corners, removes decorative surfaces and redundant copy, and simplifies status styling. No API, timing, permissions, persistence or backend changes. See the updated [design testing guide](sage-mint-design-testing.md).

## Sage and mint design — 16 October 2026

The visual update on feat/sage-mint-design changes shared styling, exam grouping, card layouts, charts and the default question navigator display. It adds no API contract or backend requirements. The earlier browser-supervision migration and real integration acceptance below remain outstanding. See [sage-mint-design-testing.md](sage-mint-design-testing.md) for the UI checks. Existing server data remains authoritative; no screenshot sample statistics are used.

## Browser controls — 16 October 2026

New additive endpoints and migration are issued in [backend-browser-controls-task.md](backend-browser-controls-task.md). The matching frontend and backend source are implemented on feat/browser-exam-controls. Apply migration 009 and complete the required real API tests before deployment; no hosted migration or integration acceptance is claimed. Send this document together with [browser-controls-testing.md](browser-controls-testing.md) to the backend developer.

The older design-only note below applies only to its original scope.

## Group 2 design update

Date: 16 October 2026. Scope: approved frontend design changes on `feat/workspace-design`, based on the backend-integrated main branch at `e422248`.

No API contract revision or new backend endpoint is issued by this update. Existing issued backend requirements remain mandatory; historical copies are retained under `nexora-backend/docs/`, including `Nexora_Backend_BE11_v0.12/docs`. This note does not assert that the merged backend has passed frontend integration acceptance.

## Required behavior to preserve during integration

- Teacher Save and next uses the existing revision-bound item-save call. A failed validation or revision conflict must not be reported as saved. Submission still requires all reviews and the existing backend validation; the new final confirmation adds no request fields.
- Student review marks are optional local IndexedDB metadata (`reviewItemIds`), scoped to school, user, attempt, exam version, schedule revision and device generation. They are excluded from answer requests, frozen answer payloads and receipt digests. Do not add them to grading or require the backend to persist them.
- Only the existing matching committed receipt permits the Submitted successfully state. Pending uploads and recovery cases are not accepted submissions.
- Refresh feedback and countdowns do not authorize access. Continue returning server time and enforcing scheduling, release, tenant and role gates. All schedule displays remain EAT.
- Charts consume existing official analytics fields without recalculating marks or changing publication gates.
- School forms retain the same mutation bodies, audit reasons, revisions, idempotency handling and memory-only credential delivery.
- The focused exam layout removes the workspace/account controls from the attempt page. Existing leave/reload guards, deadlines, local evidence retention and server revalidation remain required.

## Report back during real integration testing

Test the existing teacher save/submit flow, scheduled preparation/unlock, offline answer retry and receipt recovery, result publication/analytics, and school creation/credential flows against the real API. Report the endpoint, request ID, expected response, actual response and reproducible steps for any mismatch. No backend changes are needed merely to support the new layout.

See [the frontend testing guide](group-2-design-testing.md) for the revised controls and expected states.

Teacher import behavior update: parsed questions become editable before AI completion. Only queued/parsing imports block edits; AI remains optional background assistance. Submission still requires complete saved teacher reviews. Late AI output cannot overwrite reviewed questions or manually saved topic/explanation changes. Backend compilation succeeded; test suites were not rerun per the owner's earlier instruction.

Hosted API routing: frontend deployment now uses root vercel.ts instead of vercel.json, reading API_PROXY_TARGET from frontend Vercel environment settings. VITE_API_BASE_URL remains /api/v1. See docs/hosted-api-connection.md for frontend/backend origin settings, deployment protection and hosted acceptance steps. No hosted acceptance is claimed by this change.

Vercel database startup correction: the deployed runtime log confirms SELF_SIGNED_CERT_IN_CHAIN in DbService.onModuleInit. The backend now accepts DB_SSL_CA as a server-side PEM environment value (or the existing DB_SSL_CA_FILE, exclusively). TLS verification remains enabled. Obtain the project's trusted root certificate from Supabase Database Settings, configure the backend Vercel environment and redeploy; no hosted success is claimed before this operator step. Backend compilation passed; test suites were not rerun under the owner's earlier instruction.

Owner-authorized temporary staging exception: DB_SSL_REJECT_UNAUTHORIZED=false disables database certificate verification explicitly, including on Vercel, while retaining TLS encryption. Startup emits a warning. Verification stays enabled by default in production. Restore verification and configure a trusted CA before real school use. Backend build only; no test suite rerun.

Legacy admin-list compatibility: admin summary/detail exam schemas now permit assignmentId=null only for historical records. Teacher draft/create/update contracts remain strict. Admin lists show a repair notice for missing assignments; detail and mutation paths reject these records with LEGACY_EXAM_REPAIR_REQUIRED instead of allowing a malformed row to break the whole list. No teacher assignment, review evidence or approved version is fabricated. Recreate the legacy paper under a real assignment for the current workflow. Frontend and backend changes must be deployed together.

## Local platform and assistance implementation — 20 October 2026

Updated 20 October 2026. These contracts are implemented on the local development branch. This is not a record of production migration or deployment acceptance.

- Exam assistance: `invigilation-architecture-and-testing-plan.md` documents the API, assignment/approval model, migration 022 and testing evidence.
- Platform owner: `platform-owner-architecture-and-testing.md` documents the separate identity/API/deployment mode, restricted grants, migration 023, operator workflows and tests. The school backend now checks the subscription table when creating or rescheduling a sitting; apply the reconciled database migration before deploying that backend.
- Backups now include the platform schema. Use the updated `backup-and-restore.md` for the required role, key and ownership restore checks.

Before staging or production changes, reconcile the target's historical 020/021 migration definitions with this branch. Do not run the complete migration bundle against an unverified production ledger. Record real database, cookie/Origin, concurrency and device acceptance separately from the local unit/build results.

## Exam Privacy Shield — 21 October 2026

The supervision event enum now accepts focus_lost. Deploy compatible backend and clients together; no new database migration is required. No event establishes that a screenshot occurred, and no automatic penalty is introduced. See [architecture](exam-privacy-shield-architecture.md) and [testing](exam-privacy-shield-testing.md).

## Portal management — 21 October 2026

Local implementation adds guarded directory/draft removal, bulk question review, import cancellation with lease invalidation, class-filtered account browsing, school-wide student numbering and versioned onboarding. See [architecture and testing](portal-management-architecture-and-testing.md) for endpoints, manual acceptance and test limitations. Migration 024 adds student counters and archived drafts; it has not been applied. Reconcile the historical migration ledger before isolated database acceptance. No deployment or push is authorized by this handoff.

## Plain-language portal — 21 October 2026

Student download, saved-answer and submission screens, teacher import states, account login details, assistance and admin review wording now use end-user language. API states and payloads remain unchanged; readable import labels are a frontend mapping. See [architecture and testing](portal-language-architecture-and-testing.md). No additional backend migration is required, and migration 024 acceptance remains outstanding.

## Ethiopian calendar and EAT — 21 October 2026

Portal date fields and displays now use Ethiopian calendar dates, Amharic months, ordinary digits and standard AM/PM time in EAT. API timestamps remain UTC; the existing Gregorian wall-time parsing boundary is retained. No backend payload or migration changes are required. See [Kewti integration and testing](kewti-calendar-architecture-and-testing.md), including the tested Kenat reverse-conversion guard and unchanged scheduling/extra-time rules.

## 21 October 2026 — exam deterrents and supervision clarity

Added tiled private-reference watermarks, scoped question selection/drag deterrents, readable interruption timestamps and supervision freshness warnings. Existing backend contracts are unchanged. Reviewed package/unlock/ownership/supervision boundaries and expanded unit regressions; no production backend runtime change or migration. Fixed duplicate telemetry replay in the development demo. See [architecture and testing](exam-deterrents-architecture-and-testing.md) for evidence and outstanding real-DB/device checks.

## 22 October 2026 — isolated local real integration

Created separate persistent manual and disposable PostgreSQL databases without modifying hosted Supabase configuration. All repository migrations through 024 applied locally; 18 real integration cases and separate admin/owner password-MFA browser checks passed. See [local integrated testing](local-integrated-testing.md) for launch commands, test isolation and remaining acceptance. Test harness now uses TypeScript metadata emission, reserves its own Vite port and removes only its own student-counter fixtures. Backend HOST optionally binds local APIs to loopback.
# 22 October 2026 — queued imports and Groq/Gemini configuration

Fixed worker school discovery under restricted runtime RLS by using explicit operator scope and tenant transactions. Local worker restarted with the test school configured. Added Groq primary/Gemini fallback, bounded attempts and token reservations, actual successful-model recording, and a synthetic provider diagnostic. Private credentials remain outside Git. See [architecture, setup and acceptance guide](import-worker-recovery-and-ai-testing.md).

Validation: 168 backend unit tests, 18 real local integration cases, 229 frontend tests and 14 release/config checks passed; backend/frontend builds and frontend check passed. Live synthetic Groq response passed; Gemini returned HTTP 503 and remains unverified. Prior cancelled imports were not resurrected. No hosted database, push or deployment was involved.
