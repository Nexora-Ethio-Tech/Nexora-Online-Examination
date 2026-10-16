# Backend handoff: MVP implementation increments

Frontend verification update (15 October): no wire change. Send backend-verification-handoff.md with browser-testing.md and deploy.md for staging and integration evidence. API v0.12 remains current. Local data/cache cleanup is disabled by user decision.

Current update (15 October): implement [BE-11 verified preparation reporting](backend-readiness-task.md), API v0.12. Send the BE-11 package and its included message, follow [readiness testing](readiness-testing.md), and return the required real-database report. F-06 frontend/simulator and exact contract are now supplied. Earlier F-06 pending statements below are historical. Production browser/service-worker/backend acceptance remains outstanding.

Current update (15 October): implement [BE-10 extra-time accommodations](backend-accommodations-task.md), contract v0.11, and follow [the testing guide](accommodations-testing.md). Send the task, updated API contract and executable admin schemas/API calls (or the accompanying BE-10 bundle). The task includes the message to send and required real-database delivery report. F-05 is now issued and implemented in the frontend/demo; F-06 readiness remains pending. Earlier status paragraphs below describe their historical increments and are superseded on F-05 by this update.

Scheduling/reload update (15 October): send [backend-scheduling-reload-verification.md](backend-scheduling-reload-verification.md) and [scheduling-reload-testing.md](scheduling-reload-testing.md). Frontend EAT guidance and cold-reload recovery entry are implemented. No wire changes: backend must verify existing BE-02/BE-04 rules and return the specified integration evidence. This does not supply the still-pending F-05/F-06 contracts.

Frontend-only update (15 October): collapsible student navigation and preparation phase feedback are implemented; see [student-navigation-progress.md](student-navigation-progress.md). No backend change or new document implementation is required for this slice. Progress is local to the browser and does not supply the future F-06 readiness acknowledgement. Continue v0.10 and the audit coordination requirements.

Audit update (15 October): read [the master-plan audit](master-plan-audit.md), including its backend coordination section. BE-09/v0.10 remains the latest issued executable interface. Accommodation configuration and verified preparation acknowledgement need owner-issued addenda before implementation; their precise payloads are not yet specified. Continue existing contracts and provide staging integration evidence. This audit does not change wire formats.

Live monitoring update (14 October): implement [BE-09 live sitting monitor and device replacement](backend-monitor-task.md) under contract v0.10. Send the BE-09 ZIP and follow START-HERE.txt. Implement exact monitor schemas/calls, frozen-roster totals, truthful last-contact/save metadata and the revised transfer request requiring expectedDeviceGeneration. Return the mandatory implementation and real-database report in section 7. Preserve original deadlines, inherited server-confirmed answers, immutable old-generation evidence and one atomic audited/replayable transfer. Do not implement the frontend's private synthetic-example endpoint in production. No backend choice or approval of payloads is requested. Earlier notes below are historical increment context.

School setup update (14 October): implement [BE-08 school setup and accounts](backend-school-task.md) under contract v0.9. Follow its exact school schemas/API calls, class/subject/assignment dependencies, atomic CSV import, one-time credentials, audited password reset and session revocation. A replay returns safe issue/account metadata with credentials null; it must never retrieve or silently regenerate passwords. Preserve frozen exam rosters and pending evidence. Send the BE-08 ZIP and require the real-database implementation report in section 5. This is mandatory backend work; frontend demos do not establish backend acceptance. Earlier notes below document historical increments.

Practice update (14 October): implement [BE-07 practice release and repeated attempts](backend-practice-task.md) under contract v0.8. Read the new task first and follow its executable practice schemas/api calls. Add the student-results practice metadata and enforce the BE-04 restriction against official reuse after practice release. Keep practice answers, completions and best scores separate from official marks, receipts, recovery and publication revisions. Send the BE-07 ZIP and require the report in its section 8, including real-database race/isolation/restart evidence. This is required implementation work, not a request for backend approval. Earlier update notes below are historical dependency context.

Recovery update (14 October): implement [BE-06 administrator recovery review](backend-recovery-task.md) under contract v0.7. Follow its list/detail reads, existing decision mutation, immutable evidence and transactional acceptance/rejection rules. Receipt correlation must use the accepted recovery upload's key, never the administrator decision key. Preserve released result revisions and require reapproval for recovered results. Return its mandatory report; the demo-only example route must not be implemented in production.

Results update (14 October): implement [BE-05 official results and publication](backend-results-task.md) under v0.6. Send the BE-05 ZIP with its START-HERE instructions, schemas and API calls. Grade only exact committed official snapshots, preserve publication revisions, enforce admin/time/recovery gates, scope teacher/student reads and provide full authorized CSV/report exports. Return the evidence/report required by BE-05. Earlier interfaces remain unchanged; real backend acceptance is outstanding.

Administrator update (14 October): implement [BE-04 approval and scheduling](backend-admin-exam-task.md), now issued under contract v0.5. Follow its mandatory operations, durable audit/version/package requirements, roster/timing rules and report. Student/auth/teacher interfaces remain unchanged. Frontend admin review/return/approval/scheduling is present; the development simulator now links teacher submissions through admin decisions to student packages in the same tab. Real API/database acceptance is still outstanding. Send the BE-04 package and instruct the backend developer to implement the file and return its specified evidence. Earlier notes below describe earlier increments.

Teacher update (14 October): implement [BE-03 teacher preparation](backend-teacher-exam-task.md) under contract v0.4. Send that file, the updated api-contract.md, executable authoring schemas/api.ts and both public/templates examples. Follow its implementation sequence, validation rules and required report. These requirements are mandatory; no approval of interface options is requested. The frontend draft/import/review/submission flow now exists with an explicitly limited fixture simulator. Backend parsing/AI/persistence are not verified. BE-02 and student/auth wire formats remain unchanged. Earlier status notes below are historical.

Runner update: follow [backend-runner-integration.md](backend-runner-integration.md) to implement and test timed unlock, saves, immutable final snapshots, receipts and recovery against the new student runner. It supplements BE-02 with the actual request sequence and mandatory evidence. Contract v0.3 is unchanged.

Frontend preparation update (13 October): assigned-exam list, detail and encrypted-paper storage now exist. Follow [backend-preparation-integration.md](backend-preparation-integration.md) for the mandatory integration sequence and report. Contract v0.3 and all BE-02 requirements remain unchanged. Full offline readiness and the runner remain pending frontend work.

Prepared 13 October 2026. Send with api-contract.md and exam-engine.md. Master plan v3.0 is the product authority. This package issues mandatory implementation requirements under API contract v0.3, superseding v0.2. Backend approval is not requested. This is not a backend progress report.

## Current required task

The newest issued task is BE-09 above. Complete all still-outstanding BE-02 through BE-08 dependencies as specified; the new increment does not replace them. BE-02 remains the initial integration priority when the backend has not yet delivered student exam delivery. Include its supplied [interoperability fixture](fixtures/student-exam-v1.json) in backend verification.

## Ownership and milestone

Frontend repository: https://github.com/Nexora-Ethio-Tech/Nexora-Online-Examination. The authentication, school setup, authoring, approval/scheduling, runner, results, practice, recovery and monitoring frontend workflows now exist. See master-plan-audit.md for remaining frontend gaps and evidence limits; real backend acceptance remains outstanding. Separate backend developer owns API, migrations, isolation, jobs and hosting. Frontend owns screens, client, local persistence and recovery UI.

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

Live sitting monitoring/device administration interfaces are now specified by BE-09. School directories, assignments, CSV import and one-time credential delivery are specified by BE-08. Teacher imports/AI, approval/scheduling, official results/reports, recovery review and practice have issued contracts in BE-03 through BE-07. Issuance does not establish backend completion. Production additionally requires real AI, admin MFA, restore/rollback, phones and measured 500-student load.

## Required progress report

- Contract version implemented.
- Endpoints completed and remaining work.
- Test commands, actual results and persistence/isolation evidence.
- Staging URL and integration readiness.
- Each gap or blocker: affected endpoint/section, concrete evidence, impact and unaffected work that can continue.

Acknowledge receipt for coordination only; no approval or selection of contract options is requested.

## Owner-issued details still required

BE-02 specifies operator-assisted MFA, device enrollment/replacement and canonical digest serialization. BE-03 through BE-09 now specify content, approval/scheduling, results, recovery review, practice, school setup/accounts and live monitoring/device administration. BE-09 revises the transfer precondition/response explicitly. Report any specific remaining missing requirement; continue fully specified work. This set of increments is not a claim that every master-plan requirement has been implemented or accepted.
