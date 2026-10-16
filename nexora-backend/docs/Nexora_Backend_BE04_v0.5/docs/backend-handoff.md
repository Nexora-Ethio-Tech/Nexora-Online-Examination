# Backend handoff: first integrated MVP slice

Administrator update (14 October): implement [BE-04 approval and scheduling](backend-admin-exam-task.md), now issued under contract v0.5. Follow its mandatory operations, durable audit/version/package requirements, roster/timing rules and report. Student/auth/teacher interfaces remain unchanged. Frontend admin review/return/approval/scheduling is present; the development simulator now links teacher submissions through admin decisions to student packages in the same tab. Real API/database acceptance is still outstanding. Send the BE-04 package and instruct the backend developer to implement the file and return its specified evidence. Earlier notes below describe earlier increments.

Teacher update (14 October): implement [BE-03 teacher preparation](backend-teacher-exam-task.md) under contract v0.4. Send that file, the updated api-contract.md, executable authoring schemas/api.ts and both public/templates examples. Follow its implementation sequence, validation rules and required report. These requirements are mandatory; no approval of interface options is requested. The frontend draft/import/review/submission flow now exists with an explicitly limited fixture simulator. Backend parsing/AI/persistence are not verified. BE-02 and student/auth wire formats remain unchanged. Earlier status notes below are historical.

Runner update: follow [backend-runner-integration.md](backend-runner-integration.md) to implement and test timed unlock, saves, immutable final snapshots, receipts and recovery against the new student runner. It supplements BE-02 with the actual request sequence and mandatory evidence. Contract v0.3 is unchanged.

Frontend preparation update (13 October): assigned-exam list, detail and encrypted-paper storage now exist. Follow [backend-preparation-integration.md](backend-preparation-integration.md) for the mandatory integration sequence and report. Contract v0.3 and all BE-02 requirements remain unchanged. Full offline readiness and the runner remain pending frontend work.

Prepared 13 October 2026. Send with api-contract.md and exam-engine.md. Master plan v3.0 is the product authority. This package issues mandatory implementation requirements under API contract v0.3, superseding v0.2. Backend approval is not requested. This is not a backend progress report.

## Current required task

Implement [BE-02: student exam delivery](backend-student-exam-task.md) in increments A, B and C. Its specific clarifications are part of v0.3. Include the supplied [interoperability fixture](fixtures/student-exam-v1.json) in backend verification.

## Ownership and milestone

Frontend repository: https://github.com/codifex11/exam-frontend. At initial audit this was a React/TypeScript/Vite design scaffold with ten passing unit tests. The local authentication foundation now includes login/MFA screens, role guards, session restoration and dashboard shells; see auth-foundation.md for evidence and limits. Runner and real backend integration remain outstanding. Separate backend developer owns API, migrations, isolation, jobs and hosting. Frontend owns screens, client, local persistence and recovery UI.

First milestone: generated test student logs in, prepares encrypted seeded objective paper, unlocks at common start, answers during interruption, reconnects and receives one durable receipt for the complete snapshot.

## Required implementation details

- /api/v1, direct response bodies, list envelope, error fields and status mapping.
- Cookie sessions, CSRF bootstrap, admin MFA challenge and enrollment/seed procedure.
- school_admin role spelling and stable item/option IDs.
- GET /attempts/:id reconciliation and receipt correlation fields.
- Device binding and replacement enrollment handshake; generation alone is insufficient authentication.
- AES-GCM/base64url transport, ciphertext hash/tag convention and encryption fixture.
- Atomic revision acknowledgements/superseded entries and conflict retention.
- Canonical final digest serialization/test vector and receipt replay retention.
- Idempotency, late recovery acceptance and result revision behavior.

Implement these wire details as specified. The project owner controls the interfaces and issues missing details or revisions. Report implementation status and evidence, not accepted/rejected contract options. Do not alter interfaces independently. Internal backend choices remain yours where they preserve requirements. Shared types must derive from one executable schema source when introduced.

## Backend order

1. Verify host/PostgreSQL privileges; migrations, restricted runtime role/RLS, two test schools, generated accounts, health/readiness and login.
2. Seed approved objective paper, roster and schedule; unique attempt, encrypted package, timed unlock.
3. Row-locked revision saves and atomic snapshot/score/receipt, including retry after deadline.
4. State reconciliation, late recovery, audited transfer/decisions and race fixtures.
5. Teacher imports/AI/admin approval, then publication/results/practice/exports using subsequently issued payloads.

Provide staging base URL, allowed frontend origin, schema revision, private test-account provisioning instructions, package/digest fixtures, known limits and actual persistence/isolation evidence. Never place secrets in this handoff or source control.

## Shared verification

Two schools/all roles; unauthorized reads/writes/downloads; no early keys/results; common deadlines and accommodations; lost-response replay; offline final recovery; racing save/submit/transfer; session expiry with retained local work. Verify database answer snapshots and receipt counts, not merely HTTP 200.

Remaining detailed contracts: credential preview/one-time delivery, DOCX/XLSX jobs, AI review/progress, approval conflicts, monitoring/recovery lists, schedule edits, publication/revisions, scoped exports, topic denominators and practice scoring. Production additionally requires real AI, admin MFA, restore/rollback, phones and measured 500-student load.

## Required progress report

- Contract version implemented.
- Endpoints completed and remaining work.
- Test commands, actual results and persistence/isolation evidence.
- Staging URL and integration readiness.
- Each gap or blocker: affected endpoint/section, concrete evidence, impact and unaffected work that can continue.

Acknowledge receipt for coordination only; no approval or selection of contract options is requested.

## Owner-issued details still required

BE-02 now specifies operator-assisted MFA, device enrollment/replacement and canonical digest serialization. Remaining later workflow payloads (staff directory/content/results/practice and monitoring lists) still require owner-issued detail before their interfaces are implemented. Report a specific missing requirement; continue the fully specified student-delivery work. This package defines the first integration slice, not a complete executable schema for the entire MVP.
