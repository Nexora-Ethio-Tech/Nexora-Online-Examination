# BE-09: live sitting monitor and device replacement

Issued 14 October 2026 under API contract v0.10. These are mandatory owner-issued requirements implementing master plan v3.0 sections 2.2, 8.1, 8.4, 8.6–8.8 and 11.4. Implement the exact DTOs/calls in `src/features/exams/monitor/schemas.ts` and `api.ts`. Return the implementation and real-database evidence in section 7. This specifies required backend work; it does not claim the backend is complete.

Read this task first, then BE-02 device enrollment/replacement and BE-04 frozen scheduling, BE-06 recovery, and BE-08 account scope. **This increment explicitly revises BE-02's transfer request:** `expectedDeviceGeneration` is now required. The transfer response retains attemptId/deviceGeneration/state and adds deadlineAt/transferredAt/transferId. Other student/auth/runner payloads stay unchanged. Update any older backend transfer implementation to this version; accepting the old unguarded body is not permitted.

## 1. Scope, authorization and common rules

Monitoring belongs to the existing school administrator exam view. There is no new invigilator role, camera feed, video grid, automatic cheating score or focus-event penalty in this increment. Do not add those features.

Use `/api/v1`, authenticated cookie sessions, server-derived school, completed administrator MFA, Origin/CSRF on mutations, common errors and `Cache-Control: private, no-store`. All three monitor reads and device transfer are `school_admin` only. Anonymous/incomplete MFA: 401; wrong role: 403; unknown or cross-school sitting/attempt: 404. Never accept schoolId or student identity from a request body as authority. An expired admin session must not produce a mutation. Audit actor and school IDs, not just display names.

Monitor reads expose operational metadata only. No question text, answer values, correct keys, explanations, encrypted package, decryption key, credential/cookie, device credential hash, scores or ranks. The response schemas are strict. Browser UUIDs are non-secret identifiers, but avoid listing active device IDs or enrolled devices in monitor responses; the student supplies the replacement ID privately to staff.

## 2. Read endpoints and pagination

All reads accept `limit` (default 25, range 1–100) and optional `cursor`. Cursors are opaque, authenticated/scope-bound to the school, endpoint and resource. Reject malformed limits/cursors with 422 VALIDATION_ERROR. Use stable keyset ordering, never a silently truncated roster or history. Return `nextCursor: null` at the end. Historical and upcoming sittings remain available, including those with no attempts. Empty lists are 200 with an empty array.

| Endpoint                               | Exact response                                                                         | Ordering and purpose                                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| GET /admin/monitor/sessions            | monitorListSchema: `{items,nextCursor,serverNow}`                                      | startsAt descending, then sessionId ascending; all this school's sittings                                               |
| GET /admin/monitor/sessions/:sessionId | monitorDetailSchema: `{sitting,rows,nextCursor,serverNow}`                             | rows by frozen studentId ascending; every frozen eligible student, even without an attempt                              |
| GET /admin/monitor/attempts/:attemptId | monitorAttemptSchema: `{sitting,student,transferBlocker,history,nextCursor,serverNow}` | history by transferredAt descending, then transferId ascending; the attempt's student row remains on every history page |

Return a consistent server-time/read snapshot within each response; counts and rows must not describe different database revisions. Each page refresh is a new snapshot; do not suggest multiple pages were sampled simultaneously. GET never creates an attempt, extends time, uploads answers, marks a submission, changes a generation, or updates last student contact. An internal scheduler may separately progress expired attempts, as required by BE-02; reads must still project overdue work correctly if that job has not run yet.

`sittingSchema` fields:

- sessionId, examId, title, className, subjectName, preparationVisibleAt, startsAt, endsAt, scheduleRevision.
- `rosterCount`: all frozen roster members, independent of this page's row count. Directory imports, transfers to a different class and deactivation after scheduling do not rewrite the roster.
- `latestDeadlineAt`: maximum of frozen per-student deadlines and common endsAt. Include accommodations fixed before preparation, even if nobody has created an attempt; a student may still be active after common end. This is not a deadline extension control.
- `counts`: all six statuses below, summed across the entire frozen roster. Their sum must equal rosterCount; include zero values.

`monitorRowSchema` fields: frozen studentId/loginId/studentName, that student's deadlineAt, projected status, and `attempt: null` if no attempt exists. Otherwise attempt contains attemptId, raw persisted state, current deviceGeneration, lastContactAt, lastServerSaveAt, serverAnsweredCount, receiptAcceptedAt and recoveryId. Match the existing unique school/session/student attempt. `serverAnsweredCount` counts non-null answers in the latest accepted incremental answer records, including inherited confirmed answers; it is not a percentage, local-progress estimate, grading score or claim about unreceived work. Final submission is represented separately by its committed receipt. Do not change historical incremental saves just to match a final snapshot. `recoveryId` is the latest related recovery case (or null); a case is not a receipt.

Project statuses in this precedence order:

| Status          | Required meaning                                                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| not_started     | No attempt exists, even when the window has ended. Never fabricate an attempt or recovery upload.                                                         |
| submitted       | An actual committed official receipt exists, including accepted recovery. raw state must agree; receiptAcceptedAt is its acceptance timestamp.            |
| invalidated     | Persisted invalidated attempt with no committed receipt.                                                                                                  |
| recovery_needed | No receipt; awaiting_upload or recovery_pending, or an unfinished attempt at/after its individual deadline. This does not claim a recovery upload exists. |
| active          | Unfinalized active attempt before its deadline; indicates authorization to edit, not continuous connectivity.                                             |
| preparing       | Unfinalized preparing attempt before its deadline, including after transfer. Does not attest to local package/storage readiness.                          |

Do not return a submitted status without a committed receipt or contradictory terminal states. `receiptAcceptedAt` is null without a receipt. Internal state inconsistency must be diagnosed server-side, not concealed by manufacturing success.

## 3. Contact and answer-save timestamps

Persist lastContactAt (the master plan's `last_seen_at`) from actual successful, owner-authenticated student operations on this attempt: creation/retrieval, package access, unlock, answer saves, new final commit and recovery upload. Active operations must pass the current device credential/binding checks. Update monotonically using server time, independently of lastServerSaveAt. Do not count administrator reads, transfer approval, login alone, schedule viewing or rejected/stale-device writes as student contact. Receipt-only reads and replay of an old committed operation need not advance it. Enrollment alone has no attempt contact to update.

lastServerSaveAt remains the existing BE-02 accepted-answer-batch timestamp and is null before a save. It must not advance on monitor reads, student attempt reads, unlock or transfer. Transfer keeps the timestamp of the inherited saved work. Receipt acceptance and recovery receipt have their own timestamps; never substitute them to imply an ordinary answer save.

The frontend uses the existing runner's roughly 30-second randomized/backed-off synchronization and reconciliation, and refreshes the visible administrator monitor every 15 seconds (30–60 seconds after read errors). It does not introduce 3-second polling of every student or a new heartbeat endpoint. Return current serverNow on every monitor response. A quiet or old contact is not proof of disconnection, cheating or abandonment. No automatic penalty, submission or invalidation follows from contact age. Capacity must be measured with the actual query/transaction design, not inferred from refresh intervals.

## 4. Student registration and atomic transfer

`POST /auth/device` retains BE-02's authenticated-student `{deviceId: UUID}` request and `{deviceId}` response, real HttpOnly host-only device credential cookie, hashed credential storage and explicit school/student/device enrollment. No administrator credential or transfer token is returned to the student. Registration alone does not bind an existing attempt or reset a timer. Reusing a visible UUID without its valid credential must return 409 DEVICE_REPLACED. Lost credentials require a fresh UUID/enrollment and administrator transfer; retained browser work is not erased. Account logout/reset does not delete enrollment; authentication and account activity are rechecked.

`POST /attempts/:attemptId/device-transfer`, admin/MFA, Origin/CSRF and UUID `Idempotency-Key`, exact body:

```json
{
  "newDeviceId": "11111111-1111-4111-8111-111111111111",
  "expectedDeviceGeneration": 1,
  "reason": "Student verified; original device screen failed."
}
```

Require a trimmed 1–2000 character reason and positive safe-integer generation. Reject missing/extra fields with 422. The administrator verifies the student and obtains the ID displayed by the student on the replacement browser. Do not infer or auto-select another enrolled device. No deadline, accommodation, exam revision or answer fields are accepted here.

Within the same transaction/attempt row lock used by saves, final submission and recovery decisions:

1. Authenticate and scope before replay lookup or returning any data. Scope the key to school/actor/attempt/operation. For an identical already-committed request return the original response, even after the deadline or later finalization; changed payload under that key returns 409 REVISION_CONFLICT. Persist canonical fingerprint and response with the attempt audit for at least the attempt/receipt retention period specified by BE-02, surviving restarts. Concurrent identical requests create one event.
2. Recheck current generation equals expectedDeviceGeneration. A competing transfer with the old expected value returns REVISION_CONFLICT, even with another key. Do not accept generation overflow. Read and retain the current binding under the lock.
3. Require state preparing or active, no committed receipt, no invalidation and no recovery-pending state. Otherwise return 409 ALREADY_FINALIZED. Require server time strictly before the student's unchanged deadlineAt; at/after deadline return 409 RECOVERY_REQUIRED. The five-second final upload allowance does not permit a transfer. Recheck student activity/enrollment eligibility under BE-08 and reject inactive account access with 409 REVISION_CONFLICT.
4. Validate newDeviceId belongs to a valid, nonrevoked/unexpired enrollment for this attempt's student and school. Unknown, expired, foreign or other-student device: 422 VALIDATION_ERROR with a generic registration message, never owner information. Same currently active ID: 409 REVISION_CONFLICT. Lock the relevant binding/enrollment records as needed to avoid credential-revocation races.
5. Snapshot old-generation revision history and preserve it. Increment generation exactly once and bind the new enrolled device. Carry only latest timely server-confirmed answer values into new-generation clientSeq 0 records, with highestAcceptedSeq 0. No copying unreceived local answers, and no generation-1 fingerprint collision with new-generation sequence 1. Set state preparing until authorized unlock on the new browser. Preserve approved version, package identity/content, question/option order, schedule revision, startsAt, deadlineAt, finalAcceptUntil and lastServerSaveAt. Do not update lastContactAt merely because an admin transferred.
6. Persist one immutable audit with transferId, school/session/attempt/student IDs, actorId/actorName snapshot, reason, old/new device IDs privately, fromGeneration, toGeneration and server transferredAt. Do not log credentials, decryption keys or complete answers. Public monitor history includes only transferEventSchema fields. Commit binding, inherited answer baseline, audit and replay response atomically; return only after commit.

200 on first success and replay, exact `transferResponseSchema`:

```json
{
  "attemptId": "attempt-id",
  "deviceGeneration": 2,
  "state": "preparing",
  "deadlineAt": "2026-10-17T07:00:00.000Z",
  "transferredAt": "2026-10-17T06:30:00.000Z",
  "transferId": "transfer-id"
}
```

The replay describes that original transfer, not necessarily today's attempt state. UI refreshes the monitor for current status. `transferBlocker` on the attempt read is null only for a currently transferable attempt, `deadline_passed` for an otherwise editable attempt whose deadline arrived, `closed` for nontransferable terminal/recovery/inactive state, and `no_attempt` is reserved defensively (an unknown attempt URL still returns 404). A null blocker is not authorization to skip transactional validation.

## 5. Old device, new device and recovery behavior

The new browser reuses GET /attempts/:id, package retrieval and timed unlock. Its enrollment credential, current binding, generation and school/student identity must pass; inherited confirmed answers become available under the existing rules. The original deadline continues. It cannot bypass a not-yet-reached common start. GET /sessions/:id/attempts is not introduced; the existing idempotent POST creates/retrieves the student's unique bound attempt as BE-02 specifies.

Invalidate old-generation ordinary reads/writes/unlock as required by BE-02. A retained old browser must receive DEVICE_REPLACED or a revision error on unauthorized operations, never silently regain the attempt. Its existing in-memory question view cannot be remotely erased while offline, but its later ordinary writes are refused. Do not claim instant remote wiping or cheat-proof delivery.

Keep owner-authorized exact committed-submit replay and receipt lookup available for reconciliation. Retain stale-generation frozen evidence through the existing recovery endpoint after the final acceptance window; validate it against the historical approved version/generation, never treat it as a current save. An existing receipt remains authoritative and prevents a competing final result. Recovery review/acceptance remains BE-06, with its audit, receipt correlation and separate publication gates. A transfer does not publish marks, accept recovery or discard another local snapshot.

## 6. Frontend behavior and simulator boundary

Frontend routes: /admin/monitor, /admin/monitor/:sessionId, /admin/monitor/attempts/:attemptId, /student/device. Approved sitting cards link to their monitor. Queries are school/user/resource/page scoped and use the common ApiClient. Successful mutation is confirmed from the exact response, then the monitor is refreshed. Stale (>30 seconds), hidden/offline, errored or expired snapshots disable new transfer controls. The server remains authoritative. Generation changes invalidate an old checked confirmation. An ambiguous response retains the exact body/key in the open form and offers “Retry same transfer”; reload or leaving the form requires checking the audit/current generation before a new operation. Repeating a genuinely new transfer requires a fresh reviewed generation and reason.

`npm run dev:demo` uses one synthetic learner in one tab, in-memory registrations and shared attempt state. The optional **Load synthetic monitoring example** creates a clearly labeled 60-minute rehearsal, with a synthetic old-device binding and one server-saved answer; repeated loading returns the same example without resetting its deadline. Its private `/demo/monitor-example` route and fixture data must never be implemented in production. This fixture does not create an approved teacher paper or a publishable result report. Real authored sittings continue to use the teacher/admin flow. Two legacy completed/review student cards lack actual attempts and are omitted from the monitor; no fake receipts are manufactured for them.

The simulator does not prove credential cookies, multi-school isolation, device revocation, account-enrollment races, durable database locks, multi-browser synchronization, full school rosters, 500-student load or production recovery. Do not copy its Set/Map storage or synthetic IDs into the backend design.

## 7. Required implementation order and report

Implement persistence/migrations and scope first; operational reads and truthful status/contact projection second; the revised atomic transfer and historical generation handling third; then connect the real frontend and execute the acceptance matrix. Use an injected test clock in automated tests, never a production clock-override endpoint.

Required real-backend tests:

- Two schools, all roles, incomplete MFA and expired sessions; foreign cursor/resource IDs; no sensitive fields in monitor JSON; revoked/inactive student and device checks.
- More than 25 students, sittings and audit entries: full pagination, stable ordering and scope; totals across the full frozen roster; subsequent directory changes do not alter it. Verify accommodations and a student active after common end.
- No attempt, preparing, active, timely submitted, accepted recovery, invalidated, awaiting upload and recovery pending. Overdue active/preparing status projects recovery needed without fabricated submission; an ended no-attempt row remains not started.
- Successful student contact updates without answer-save changes; admin reads and transfer do not update contact; lastServerSaveAt stays unchanged on transfer; no connectivity or misconduct inference.
- Missing/expired device cookie, reused visible UUID, other-student/cross-school/revoked device, same active device, missing expected generation and reason, stale generation and exact deadline boundary.
- Server-confirmed-only answer inheritance at sequence 0; first new edit sequence 1 accepted; old revision history preserved; package/order/schedule/deadline unchanged; old ordinary writes/unlocks rejected; delayed stale evidence retained for review.
- Same-key concurrency, conflicting same-key payload, competing different keys, save vs transfer, submit vs transfer and recovery acceptance vs transfer. Assert one valid final outcome and audit count in the database. Force rollback between writes and verify no partial binding/baseline/audit/replay. Disconnect the response after commit, restart the backend, and retry identically after deadline/finalization: original response, no second increment/event.
- Real frontend on two separate browser profiles/devices: register B, approve on admin, unlock B, restore received answers, deny A's writes, retain A's evidence, submit B with exact receipt, report submitted in admin, prevent a new transfer after submission. Test offline/401/reload behavior and 360px layout; no deadline extension.

Return contract v0.10; implementation commit/version and migrations; endpoint checklist; staging URL and exact allowed frontend origin; private synthetic-account/device/MFA provisioning instructions; actual test commands/results; database race/rollback/restart/isolation assertions; timings/query plans/load measurements where performed; and every blocker with affected section, evidence, impact and next action. Continue unaffected work. These requirements are not optional, and backend approval or a choice of alternative payloads is not requested. Report missing owner-controlled details specifically rather than silently changing the contract.
