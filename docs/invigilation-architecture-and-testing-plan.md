# Exam assistance: architecture and testing guide

Status: implemented locally on `feat/verified-platform-development`; not deployed. Updated 20 October 2026. This replaces the earlier proposal in this file. Real PostgreSQL, migration-upgrade and two-device acceptance remain pending.

## What the user sees

1. A student chooses **Pause and request assistance** in an active exam. Editing stops immediately and the paper is hidden. Saved answers and pending uploads remain on the device. The original exam timer continues.
2. A teacher opens **Exam assistance**, selects an assigned sitting, checks the student and workstation, and enters a reason and a fresh authenticator code on the teacher's own device. Administrators have school-wide access.
3. Approval clears only the assistance pause. The student chooses **Revalidate and reopen**. Normal identity, device, time and unlock checks run again before editing resumes.
4. Rejection or expiry leaves editing paused. The student can request help again. An administrative suspension must be lifted separately by an administrator. No assistance decision changes marks or creates a submission.

A request lasts at most five minutes and never beyond the exam deadline. Finalization at the deadline retains the existing exact-snapshot/receipt process. Final submission is deliberately not blocked by the assistance flag: previously saved evidence must still be deliverable. This does not claim the browser can prevent a modified client from writing local data.

Focus changes remain interruption telemetry, without automatic disciplinary action. This is an explicitly approved extension to master-plan v3 sections 2.2/17.1, preserving its timing, receipt, permission and conduct rules. It uses existing teacher/admin accounts; a separate invigilator role, roster subgroups and automatic focus-lock policies are outside this slice.

## Components and data

- `nexora-backend/migrations/022_exam_assistance.sql`: additive assistance flag on attempts, sitting-scoped teacher assignments, expiring assistance requests, composite tenant foreign keys, unique pending request per attempt, forced row-level security and runtime grants.
- `nexora-backend/src/modules/delivery/assistance.controller.ts`, `assistance.service.ts`, `assistance-policy.ts`: executable request contracts, authorization, transactional decisions and timing/revision checks.
- Existing delivery save and preparation unlock paths reject `ASSISTANCE_PENDING`. Supervision reads expose `assistancePaused`.
- `src/features/assistance/api.ts`: typed frontend responses and calls; `AssistancePage.tsx`: staff decisions/admin assignments; `StudentAssistance.tsx`: student request/status.
- `src/features/runner/engine.ts`: immediate pause, preserved local record/outbox, startup/supervision pause checks and existing deadline finalization.
- Existing protected MFA operator accepts teachers as well as administrators. `--staff-id` is an alias for the existing `--admin-id` option. Bootstrap still creates administrators only.

The request stores school, attempt, student, device generation, supervision revision, expiry, decision actor/time and reason. The attempt resolves to its immutable exam session. Assignment changes have an expected revision; conflicting changes require refresh. Assignment and decision audit events use the existing audit table. The request row records the student request itself.

## API contract

All routes have the existing `/api/v1` prefix. Sessions determine the school and caller; clients cannot choose a tenant. Global authentication, role, Origin/CSRF and private/no-store response handling apply. Student assistance calls also validate the actual current browser credential inside the transaction.

| Method and route                         | Permission                    | Body/result                                                                                |
| ---------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------ |
| GET `/assistance/sessions`               | Teacher/admin                 | Up to 100 most recent sittings; teachers see assigned sittings only                        |
| GET `/assistance/sessions/:id/staff`     | Admin                         | Active staff, MFA confirmation flag, assignment status/revision; no secrets                |
| POST `/assistance/sessions/:id/staff`    | Admin                         | `{staffId, active, expectedRevision, reason}`; teacher must have confirmed MFA to activate |
| GET `/assistance/sessions/:id/requests`  | Assigned teacher/admin        | Up to 200 pending unexpired requests, oldest first; refresh as decisions clear the queue   |
| POST `/assistance/requests/:id/decision` | Assigned teacher/admin        | `{action: 'approve' or 'reject', reason, code}`                                            |
| GET `/attempts/:id/assistance`           | Owning student/current device | `{paused, request}`; request may be null                                                   |
| POST `/attempts/:id/assistance`          | Owning student/current device | `{requestId: UUID, deviceGeneration}`; returns `{paused, request}`                         |

A request response contains `{id, attemptId, status, expiresAt, reason}`. Inbox rows also contain `displayName`, `loginId`, `deviceGeneration`. Reasons are trimmed, required for staff changes and limited to 500 characters. The six-digit code never enters a query/mutation cache, URL or browser storage. Its input clears when a decision is sent.

The student reuses its request UUID following a lost response. Another key while the same current request is pending coalesces to that request. An identical committed staff decision by the same actor/reason replays without consuming another MFA step; a conflicting decision fails. Current assignment/identity checks still apply before replay. Assignment writes use revision conflict detection rather than automatic retry.

## Transaction and security rules

Decision order: lock/recheck active staff; establish current sitting assignment (teacher only); lock attempt; lock/recheck request; check active state, administrative suspension, deadline, pause, device generation, supervision revision and expiry; verify confirmed MFA and consume a new step; clear pause only for approval; persist decision and audit in the same transaction.

The shared assignment lock and staff row lock serialize revocation and decisions. Attempt locks serialize assistance requests and decisions with other attempt changes. PostgreSQL race behavior still requires integration testing; unit mocks do not prove it.

Request rate limit: 10 per student per 300 seconds. Decision rate limit: 5 per staff member per 60 seconds. Limits are charged outside the decision transaction, so failed codes do not roll back their limit usage. There is no new school/IP-wide assistance limit in this slice.

This uses the existing staff authenticator and consumed-step table on the staff's own device. A code used for enrollment/login/another decision cannot be reused; wait for a fresh code. A separate recent-verification grant could improve high-volume staff usability later. No authenticator enrollment URI or generated code is returned by normal assistance APIs. An authenticated approval is an audit fact, not proof of physical presence.

Teacher enrollment through the protected operator temporarily deactivates the teacher and revokes sessions until confirmation. Schedule enrollment before an exam, verify identity through the established support process, and use a private interactive terminal. Example, from the backend directory, with approved isolated staging credentials configured:

```powershell
npm run mfa:operator -- enroll --school-id <school-uuid> --staff-id <teacher-uuid> --operator <operator-identity> --reason "Enroll assigned exam staff"
```

The tool displays enrollment material privately and prompts for the confirmation code. Do not put that material in tickets, guides or logs. Historical MFA audit action names retain the existing `admin_mfa_*` naming even for teacher enrollment; the audited resource ID identifies the staff account.

## Migration and deployment gate

Migration 022 has NOT been applied. This checkout has `020_ai_exam_generation.sql`; the other checkout/report mentions `020_invigilator_assignments.sql` and `021_exam_clarifications_and_facilitator.sql`. Those histories cannot be assumed identical. Before any deployment, inspect the target migration ledger and actual table definitions read-only, reconcile the histories on an isolated clone, then test 022 and the deployed artifact together. Do not overwrite historical migration files or run an unreviewed migration bundle against production.

Deploy database additions before the backend that reads the new flag. The frontend schema defaults the additive flag to false for older supervision fixtures, but the new assistance endpoints require the new backend. The demo transport does not simulate assistance approvals; use real isolated staging or the targeted mocked tests. Vercel remains the current hosting target; this workflow requires no long-running process or scheduler.

## Automated verification

From the frontend repository:

```powershell
npm run check
npm run build
```

From `nexora-backend`:

```powershell
npm run build
npm run test:unit
```

Relevant tests:

- Backend `test/unit/assistance.spec.ts`: role denial, assignment denial, browser binding, ownership, stale generation/revision, closed/deadline/suspended states, expiry, incorrect/consumed MFA, identical decision replay, bounded request expiry, pending-request coalescing, immutable timing and audit invocation.
- Frontend `src/features/runner/runner.test.ts`: immediate editing pause, preservation of answers/outbox when the request fails, and assistance revalidation before opening the paper.
- Frontend `src/features/assistance/AssistancePage.test.tsx`: reason/code requirements, clear-on-send credentials, error feedback and absence of codes from query/mutation caches.

These are isolated unit/component tests. They do not establish database transactions, cross-tenant RLS, production deployment, real-device behavior or 500-student capacity.

Verification recorded on 20 October 2026:

- Frontend `npm run check`: passed type checking, lint and formatting; 202 unit/component tests and 9 release-source checks passed.
- Frontend `npm run build`: passed. Existing large main-chunk warning and dependency annotation warnings remain.
- Backend `npm run build`: passed.
- Backend `npm run test:unit`: 113 tests passed, including 20 assistance tests.
- Migration application, real API/database races, production deployment and two-device browser acceptance: not performed.

Pending requests made obsolete by a device/supervision change are presented as expired immediately, so students can request help again. Staff inbox queries exclude those obsolete requests. Stored pending rows are expired transactionally when a fresh student request is created.

## Required staging acceptance

Use two schools, an admin, an assigned teacher, an unassigned teacher and a student, all synthetic. Use separate student/staff browsers and real cookies/CSRF/device enrollment.

1. Apply the reconciled migration chain to a fresh isolated database and to an isolated clone of the observed schema. Confirm runtime grants/RLS using the actual runtime role, including cross-school reads/writes. No production data is needed for fixtures.
2. Enroll the teacher through the operator with confirmation. Check that no routine staff/student response contains secret/URI material. Assign the teacher to one specific sitting; verify other-sitting and other-school denials.
3. Start an exam, save an answer, request assistance. Verify paper hides, new save/unlock calls fail, local answers/outbox remain, and deadline/final-accept timestamps do not change.
4. Approve from the teacher device with a fresh code. Student revalidation must restore the saved answer. Repeat with rejection, expiry, wrong code, consumed code, logout, lost response and reload.
5. Race two approvals, approval/revocation, approval/device transfer, approval/admin suspension and approval/deadline. Inspect persisted rows and audit events: one committed decision, no timing changes, stale requests rejected. Retry deadlocks safely by rereading state; never infer an approval from a timeout.
6. Confirm administrative suspension cannot be lifted by assistance. Confirm deadline finalization while paused still requires the exact saved snapshot and committed receipt, with ordinary recovery behavior after the acceptance window.
7. Verify keyboard use and 360px student layout, offline request feedback, reconnect revalidation and visible-tab refresh. Focus loss alone must not trigger a new pause or penalty.
8. Record actual environment, commit, migration ledger, test identities, devices, outcomes and failures. Keep this feature out of production acceptance until these cases pass.
