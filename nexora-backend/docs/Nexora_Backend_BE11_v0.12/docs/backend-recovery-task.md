# BE-06: administrator recovery review

Issued under API contract v0.7, 14 October 2026. Implement these requirements exactly and return the report below. The project owner defines the interface; do not request approval of alternate endpoint shapes. This completes the BE-02 recovery decision workflow and connects it to BE-05 results revisions. Earlier student/auth/teacher/admin/results interfaces remain unchanged. No real backend implementation has been inspected.

## What to do with these files

Read this document first, then backend-student-exam-task.md section 8, backend-results-task.md and the executable src/features/exams/recovery/schemas.ts and api.ts. Implement the list/detail reads and the already-issued decision mutation, including immutable evidence, audits and transactional receipt/result creation. Connect the frontend and return the implementation/testing report. The development simulator and its synthetic example are not a backend implementation or acceptance evidence.

## 1. Authorization and list

All routes use /api/v1, opaque authenticated cookie sessions, completed administrator MFA, server-derived school scope and private/no-store responses. Only school_admin may read recovery evidence or decide a case. Students and teachers get 403 FORBIDDEN even if they know an ID. Anonymous or unfinished MFA gets 401 AUTH_REQUIRED. An administrator requesting another school's/unknown ID gets 404 NOT_FOUND. Decisions require allowed Origin, X-CSRF-Token and a UUID Idempotency-Key. Use the common error object with details array and requestId.

GET /admin/recovery?status=pending&limit=25&cursor=... returns recoveryListSchema: `{ items, nextCursor, serverNow }`. status is pending (default: only recovery_pending cases) or all (pending plus decided). Default limit 25; allowed 1–100. Sort oldest receivedAt first, then recoveryId; opaque cursors must be bound to school and filter. No missing or duplicate rows on a stable traversal. Invalid filters/cursors return 422 VALIDATION_ERROR. GET is read-only, never creates attempts or decisions.

Each item is recoverySummarySchema:

```json
{
  "recoveryId": "case-id",
  "attemptId": "attempt-id",
  "sessionId": "sitting-id",
  "title": "Mathematics",
  "className": "Grade 10 A",
  "studentName": "Synthetic Student",
  "loginId": "SCH-001",
  "receivedAt": "2026-10-17T07:12:00.000Z",
  "status": "recovery_pending"
}
```

status is recovery_pending, accepted or rejected. List responses contain summary metadata only; no answer snapshots or keys. All evidence and decisions remain available through the all filter after settlement.

## 2. Immutable case detail

GET /admin/recovery/:recoveryId returns recoveryDetailSchema. Include every summary field plus:

| Field                        | Required value                                                                                                                                                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| serverNow                    | Current server UTC ISO time.                                                                                                                                                                                                                    |
| reason                       | The student's retained upload reason, rendered as untrusted plain text.                                                                                                                                                                         |
| deadlineAt, finalAcceptUntil | This student's original deadline and deadline + five-second allowance; no timer reset on recovery.                                                                                                                                              |
| snapshotDigest               | BE-02 SHA-256 of attempt ID and selected immutable final body using the existing canonical serialization.                                                                                                                                       |
| snapshot                     | Exact `{ examVersion, scheduleRevision, deviceGeneration, finalSeq, answers: [{ itemId, value }] }` received in this upload; every approved item once, null means unanswered.                                                                   |
| currentDeviceGeneration      | Authoritative generation recorded when this upload arrived. It is immutable evidence; the screen labels it “Generation at upload.”                                                                                                              |
| latestTimelySave             | `{ savedAt, highestAcceptedSeq, answers: [{ itemId, value, clientSeq }] }`, captured when the upload arrived from the latest accepted timely server state. savedAt null and answers empty if none; do not replace this with late evidence.      |
| paper                        | The matching frozen version's allowlisted paper `{ examVersion, title, instructions, items: [{ itemId, type, stem, marks, options: [{ id, text }] }] }`. Same paper schema as the runner, no extra properties.                                  |
| relatedUploads               | All other uploads for the same attempt, as recoverySummarySchema entries. Include pending and decided cases; never silently replace earlier evidence.                                                                                           |
| canAccept                    | Authoritative current eligibility for acceptance. False if decided, already finalized elsewhere, invalidated, or source snapshot/version cannot be validly accepted. Recheck in the decision transaction regardless of this flag.               |
| acceptanceBlocker            | null when acceptance is permitted; otherwise a helpful safe explanation. Do not disclose foreign resources.                                                                                                                                     |
| decision                     | null while pending; otherwise `{ decision: "accept" or "reject", reason, decidedAt, decidedBy, resultRevision }`. decidedBy is the actor display name; persist actor ID separately. resultRevision positive for acceptance, null for rejection. |

The client displays question text, timely answer and uploaded answer side by side without editing them or grading in the browser. Missing timely answer differs from an explicitly unanswered final item. The backend validates complete item membership, option IDs, known versions/generations, safe sequences and digest integrity. An old known device generation or lower sequence is disputed evidence for review, not an automatic academic penalty. Fabricated generations/foreign items are rejected by the BE-02 upload route.

Keep the original final snapshot, upload key, digest, reason, server received time, generation-at-upload and latest timely evidence immutable. Decisions change status/audit fields only. Never execute uploaded text or use it as instructions. Keys/explanations are not needed in this comparison payload. Server-side marking uses the separately stored approved keys.

## 3. Decision mutation (existing BE-02 shape retained)

POST /recovery/:recoveryId/decision with Idempotency-Key and body:

```json
{ "decision": "accept", "reason": "Checked retained answers against the school incident record." }
```

decision is accept or reject. Trim reason; require 1–2000 characters. Return 422 VALIDATION_ERROR for blank/invalid values. The frontend requires a deliberate selection, a reason and review confirmation; enforce validity and authority server-side independently. Confirmation text is a UI safeguard, not an extra API property.

Success 200 decisionResponseSchema:

```json
{
  "recoveryId": "case-id",
  "decision": "accept",
  "decidedAt": "2026-10-17T07:25:00.000Z",
  "resultRevision": 4
}
```

resultRevision is null on rejection. Use the immutable case ID as the decision target: this operation has no client revision field. Lock the case and attempt and verify that the case is still pending inside the transaction. Another decision on an already-settled case with a new key returns 409 REVISION_CONFLICT. Same actor/school/operation/key and canonical body returns the original response even after settlement/restart; different reuse returns 409 REVISION_CONFLICT. Persist idempotency records; an HTTP timeout is not proof of failure. Return the original success only after authenticating and authorizing the caller.

### Acceptance transaction

1. Lock attempt, selected recovery, competing recoveries and sitting result/publication state in a consistent order shared with final submission and transfer.
2. Verify pending status, school ownership, frozen approved version, snapshot validity and absence of a competing committed submission. Reject replacement of an existing official submission with 409 ALREADY_FINALIZED. Acceptance cannot reopen an invalidated attempt.
3. Deterministically grade the selected immutable snapshot against its approved key. Persist that exact complete final snapshot, official result revision and unique committed receipt atomically. Never substitute timely saves, another upload or edited answers.
4. Receipt snapshotDigest and finalSeq must match the accepted upload. Receipt idempotencyKey MUST be the original accepted recovery upload's key, not the administrator decision key. The student runner uses the original final/recovery key plus digest/sequence to correlate its retained local evidence. acceptedAt is server acceptance time; preserve original receivedAt separately.
5. Set attempt submitted and selected recovery accepted. Reject every other pending upload for the same attempt as superseded, recording actor, time and a reason referencing the accepted recovery. Preserve their evidence. Unique constraints and locks must prevent two accepted final snapshots/receipts.
6. Create a new sitting result candidate revision, recompute ranks and analytics, and preserve previously approved/publicly released snapshots. Do NOT approve publication or enable practice. Audit actor, target, decision, reason, server time and source/result IDs. Commit all changes before returning success.

### Rejection transaction

Record rejection, actor, reason and server time; preserve original evidence. Do not create a receipt, score, zero mark or invalidation. If other unresolved uploads exist, keep attempt recovery_pending and point its recovery read to the latest unresolved upload. When the last pending upload is rejected, return the attempt to awaiting_upload with receipt null and the most recently decided recovery visible as rejected. This deliberately preserves the existing BE-02 behavior and allows additional separately identified evidence to be reviewed later.

Rejected last uploads are not finalized results. BE-05 may still require an explicit publication exclusion for an awaiting_upload attempt. A rejection is not an implicit publication approval or fabricated zero result.

### Races and new evidence

Any new recovery upload or changed recovery status must advance the candidate revision used by BE-05 publication checks, even when computed numeric scores have not changed. Otherwise a previously reviewed exclusion could silently cover newly arrived evidence. Race publication/new upload/decision under the same locks: either include the state in the reviewed candidate or reject stale approval. Preserve older approved revisions. Accepting one case must settle competing pending cases in the same commit so publication cannot remain blocked by an overlooked upload.

## 4. Student reconciliation

No new student endpoint or DTO is introduced. GET /attempts/:id and /receipt show the existing submitted/receipt/recovery fields on acceptance, with no unreleased score. After rejection show the existing rejected recovery status with receipt null (unless an independent already-committed official submission must be preserved).

The runner's “Check school decision” reconciles against these reads. It shows Submitted only for its exact matching digest/sequence and original final or recovery key. An accepted different browser snapshot must not cause unmatched local evidence to be discarded. Rejection retains local work and directs the student to school staff. Do not purge IndexedDB evidence or change deadlines as part of a decision.

## 5. Required tests and delivery report

Provide actual backend/database evidence for:

1. Late upload appears in the admin queue/detail with correct student, original timestamps, version, immutable reason, complete snapshot and latest timely saves. Empty queue and more than 25 cases paginate correctly; all shows preserved decisions.
2. A timely partial save and different late final snapshot remain distinct. All unanswered values and absent timely values are represented correctly. Old known device-generation evidence is reviewable; fabricated/foreign data is denied.
3. Accept creates one exact final snapshot, objective score, receipt and new revision. Verify receipt upload-key/digest/finalSeq correlation with the real student runner. Forced rollback leaves no partial acceptance.
4. Reject creates no score/receipt, keeps evidence, and sets recovery_pending or awaiting_upload as specified. Rejected evidence remains visible; a distinct new upload does not overwrite it.
5. Multiple pending uploads: accepting one rejects the others with supersession audit. Concurrent accept/accept and accept/ordinary submit create at most one final result/receipt; other outcomes are explicit conflicts.
6. Lost decision response then same retry after process restart returns the original response. Changed key reuse and new-key decisions on settled cases conflict. Blank reasons and unauthorized writes fail.
7. Existing published revision stays unchanged after acceptance. New candidate ranks/analytics are correct and require fresh approval/time gates. A newly arrived pending upload increments candidate revision even if numeric marks are unchanged.
8. Student/teacher/pre-MFA admin cannot list/read/decide; another school's IDs return 404; related-upload joins, paper data and audit records remain school scoped. No scores in student receipts and no answers in ordinary logs.
9. Actual frontend admin selection/reason/confirmation and student Check school decision succeed for accepted/rejected cases. Test refresh/relogin and a lost response; do not label mocked tests as database/browser acceptance.

Return:

```text
Task: BE-06 recovery review
Contract: v0.7 + backend-recovery-task.md
Implemented endpoints and not yet implemented work:
Commit/build identifier and migrations:
Staging API URL and exact allowed frontend origin:
Synthetic seed/run instructions:
Test commands and pass/fail evidence for each case above:
Atomic acceptance/receipt/result and race evidence:
Receipt digest, finalSeq and recovery-upload-key correlation:
Audit/supersession and publication revision evidence:
Frontend integration tested: yes/no, exact scope and devices:
Concrete blockers: affected requirement, evidence, impact:
Unaffected work continuing:
```

Do not send live credentials, private answer snapshots or real student records in the report. The separate demo-only /demo/recovery-example endpoint is NOT part of the backend contract and must not be implemented or exposed in production.
