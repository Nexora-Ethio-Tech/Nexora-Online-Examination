# Backend integration instruction: frontend preparation

Issued 13 October 2026. Mandatory guidance under API contract v0.3 and BE-02; no new wire format or approval/options request. The master plan remains authoritative. This note supplements the previous documents.

## Deliver now

Implement BE-02A against the real database. The frontend now exercises student schedules, device enrollment, attempt creation/reconciliation and encrypted packages. Do not wait for teacher import or the frontend runner. Seed approved synthetic papers to connect this path. Timed unlock remains part of BE-02A although this screen does not call it yet.

## Exact request sequence

All paths use deployment prefix `/api/v1`. Preserve direct JSON bodies, cookie credentials, CSRF, errors and status codes from the contract.

1. After login, GET /auth/me supplies student identity, school and the current CSRF token. Client-supplied school/student IDs never authorize access.
2. My exams calls GET /me/exams?limit=25 and follows nextCursor through cursor parameters. Return eligible sittings in the required stable order, including completed cases. Empty means items=[] and nextCursor=null. Include serverNow. This page currently polls every 30 seconds.
3. Detail calls GET /me/exams/:sessionId, including direct navigation. Return the same item inside exam, plus serverNow. It polls every 15 seconds. This GET must never create an attempt or disclose questions. Ineligible or absent sitting: 404.
4. Download explicitly re-reads detail, then POST /auth/device sends the retained browser UUID. Implement BE-02 section 5's HttpOnly credential and enrollment relationship; return the same UUID. The visible UUID alone does not prove ownership. DEVICE_REPLACED must not silently take over an attempt.
5. POST /sessions/:sessionId/attempts sends `{deviceId}` and a retained UUID Idempotency-Key. Return the complete attempt response: 201 first creation, 200 replay/recovery. Repeated clicks, lost responses and different keys still produce one student/sitting attempt with the same persisted deadline.
6. GET /attempts/:attemptId reconciles generation, state and version. This screen downloads only a preparing attempt. Do not downgrade active, submitted, invalidated, awaiting_upload or recovery_pending states to make downloads pass.
7. GET /attempts/:attemptId/package returns only packageId, examVersion, scheduleRevision, algorithm, iv, ciphertext and sha256. No extra key, answer or explanation fields. Match attempt versions. SHA-256 covers decoded ciphertext including the appended GCM tag; base64url is unpadded. Frontend verifies before saving locally.

Enforce membership, school ownership, assignment and specified device rules on every protected call. Enforce allowed Origin and X-CSRF-Token on every POST. Backend timing checks remain mandatory even when the UI disables a button. Browser cancellation may occur after server commit; idempotent replay must remain safe.

## Required tests

Seed scheduled, preparing, open, ended, submitted and recovery-pending cases, plus accommodation. Preserve the ten-minute preparation window. Demonstrate:

- Other schools/students and wrong roles cannot read or mutate the sitting.
- List/detail GETs leave the attempts table unchanged; empty and multi-page lists preserve cursor isolation and order.
- Creation/package before preparation are denied; unlock before start and at deadline is denied. Apply BE-02's existing-attempt reconciliation exceptions exactly.
- Lost-response replay returns the same attempt/deadline after restart.
- A known device UUID without its credential cannot take over. Another student's enrollment grants no access.
- Encryption/hash fixture agrees; official plaintext recursively excludes private grading fields. Packages match the frontend schema.
- Submitted/recovery-pending states remain accurate even during phase=open. No fabricated receipt or unreleased mark.
- Real browser cookies, CSRF, preflight and credentialed CORS work from the exact frontend origin. No wildcard credentialed CORS.

## Required report

Use the BE-02 report template. Supply implemented/unfinished endpoints, backend commit/build, migrations, seed/run commands, test output, staging API prefix, exact allowed frontend origin and fixture results. Supply synthetic credentials privately. Report blockers with affected requirements, evidence and impact; continue unaffected work. Do not substitute interface alternatives without a project-owner revision.

Demo/frontend tests do not establish backend completion. The frontend team will run this sequence against your deployment. Continue BE-02B and BE-02C while the frontend runner is developed; unlock, answers, final receipts and recovery remain required.
