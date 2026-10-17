# Backend browser controls contract — required integration work

Issued 16 October 2026 on feat/browser-exam-controls. This additive contract implements the user's browser-controls decision. It supersedes no answer, receipt, recovery or deadline rules. Frontend DTOs: src/features/runner/supervision.ts. Backend implementation: nexora-backend/src/modules/delivery/supervision.service.ts. Migration: nexora-backend/migrations/009_attempt_supervision.sql.

## Deployment order

Apply migration 009 through the existing migration process to a verified staging database, then deploy the matching backend and frontend. Do not deploy this frontend against a backend lacking the supervision endpoints: initial opening fails closed. No hosted database migration or deployment was performed by this task. Existing admin monitoring integration is still required to reach real attempts through Live exams.

Keep cookie authentication, CSRF, Origin, school scoping, admin MFA, runtime-role RLS and the existing rate limits. The backend developer must run and report the real integration checks below; the added source implementation is not proof of live enforcement.

## Endpoints (under /api/v1)

GET /attempts/:id/supervision: owning student or same-school administrator. Returns attemptId, suspended, revision, deadlineAt, serverNow, events and history. Events and history are drawn from the latest 100 combined records, newest first. No GET may change attempt state, deadline, marks or attendance. Revision starts at 0.

POST /attempts/:id/interruptions: owning student, body `{ events: [...] }`, 1–50 records. Each record has UUID id, kind (hidden, returned, pagehide, fullscreen_exit), UTC observedAt, positive integer deviceGeneration. Returns `{ acceptedIds: [...] }`. Client timestamps and events are untrusted. Add server receivedAt; deduplicate by school/attempt/event ID and reject different payload reuse. Permit retained historical generations, including delayed reports after finalization; reject future generations. Cap stored student reports at 2,000 per attempt; acknowledge only retained or already-matching reports. Frontend queues at most 200 optional reports without evicting any answer evidence.

POST /attempts/:id/supervision: same-school school_admin with verified MFA and UUID Idempotency-Key. Body: `{ action: "suspend" | "resume", reason: "1–500 trimmed characters", expectedRevision: 0 }`. Returns the current supervision representation. Reusing a key with a different actor or command conflicts. An identical replay returns current state without another mutation, even after cutoff. Otherwise require current revision and a preparing/active attempt before its deadline. Increment revision and audit actor, action, reason, server time. Clear form after conflicts and refresh before issuing a new command. Never alter deadline, answer data, device generation or final snapshot.

Use the same attempt row lock for supervision mutations, saves, unlock and final submission. Suspension is a separate boolean, not a new attempt state. Reject package/unlock/answer writes/new submission with HTTP 409 ATTEMPT_SUSPENDED while suspended. Existing matching committed submission replay and receipt reads remain accessible. Recovery upload/decision remains available under existing rules; acceptance does not publish results. Device replacement does not implicitly resume suspension. Student interruption reporting never sets suspension or deducts marks.

## Frontend behavior and limitations

Initial unlock requires a supervision read. Active runners poll every 15 seconds and on visibility return/online, hiding the paper when suspension is observed. Admin approval permits reopening through existing revalidation. Temporary network failures preserve offline editing; the server still rejects unauthorized writes when it is reached. Therefore this is not immediate suspension of an offline device. Reports are local IndexedDB metadata, separate from answer sequencing and frozen digests, and are retried in batches. Last page-close delivery is not guaranteed.

The watermark and optional fullscreen are deterrents. Neither the backend nor a website can prevent OS screenshots, external photographs or all navigation. These features must not be marketed as screenshot blocking or cheating proof.

## Required report back

Run docs/browser-controls-testing.md against the real API and disposable PostgreSQL database. Report migration result; role/tenant/MFA/CSRF tests; concurrent suspension/save/submit outcomes; idempotent replay after a lost response; deadline expiry and retained recovery evidence; and student/admin browser observations. Include request IDs and exact mismatches. Do not mark real integration complete based on the demo or database-double unit tests.
