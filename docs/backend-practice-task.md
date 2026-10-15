# BE-07: practice release and repeated attempts

Issued under API contract v0.8, 14 October 2026. Implement these requirements exactly and return the report in section 8. This implements the master plan's separate practice workflow. The project owner defines these interfaces; do not substitute endpoint shapes or ask the backend developer to select product behavior. Report concrete blockers and continue unaffected work. No real backend implementation has been inspected.

## What to do with these files

Read this document first. Use `src/features/practice/schemas.ts` as the executable response/request definition and `src/features/practice/api.ts` for exact calls. Also apply the additive `practice` field in `src/features/results/schemas.ts` and the scheduling restriction below. Read BE-04 for immutable approved versions and frozen rosters, BE-05 for official publication, and the common API contract for authentication/errors. `docs/student-practice.md` explains the frontend demo and verification limits. Do not implement the in-memory demo store as a backend.

Deliver durable database migrations, authorization, transactional scoring and integration tests, then connect the frontend with mocks disabled. Practice requires an internet connection for answer checks and completion. There is no practice offline outbox, timer, device transfer or official receipt. Preserve every existing official exam endpoint and receipt/recovery behavior.

## 1. Access and release rules

All paths below use `/api/v1`. Use opaque cookie sessions, server-derived school/user scope, allowed Origin and session-bound CSRF for mutations. Administrator access requires completed MFA. Every mutation below requires a retained UUID `Idempotency-Key`. Responses containing practice metadata/content use `Cache-Control: private, no-store`. Errors follow the common shape with `details: []` and `requestId`.

Only school_admin may list/configure practice releases. Teachers cannot enable practice, impersonate students or read their practice attempts. Only students may use their own practice list/attempts. Anonymous/unfinished MFA: 401 AUTH_REQUIRED. Wrong role: 403 FORBIDDEN. Unknown/foreign-school/other-student/ineligible resource: 404 NOT_FOUND. Check these before revealing resource state.

A student is eligible through membership in the frozen roster of a related sitting for that immutable approved exam version, within the authenticated school. Require active account/school membership. Official attendance, a finalized mark or a passing mark is not required: an absent or explicitly excluded roster member may practice after the release gates. Practice cannot fix their official mark. Derive identity from the session, never from a request studentId.

Practice content is available only when **all** of these hold:

1. The administrator has explicitly enabled practice for the approved version.
2. `releaseAt` is non-null and server time is at or after it.
3. At least one related official sitting exists. Every related cohort has an administrator-approved official publication whose release time has arrived. A planned results date alone does not qualify. An already released immutable revision satisfies publication even if a later candidate awaits approval.
4. All related sittings using the same exam/version are closed. Server time must be strictly later than the maximum of their common end plus five seconds and every roster member's accommodated `finalAcceptUntil`. Include accommodated members who have not created attempts; do not derive this only from existing attempt rows.

An admin can configure enablement before these gates are ready; return `available: false` with all current blockers. This is a scheduled configuration, never an override. Use server time on every student content read, start, answer, completion and response replay. Blocked access returns 409 PRACTICE_NOT_RELEASED with a clear safe reason. List metadata can remain visible while locked; never include questions, option text, keys or explanations in list/access payloads.

Disabling access blocks further content reads and mutations, including cached successful response replays. It preserves attempts and completed best scores. Re-enabling under the gates allows resumption. Previously delivered explanations cannot be retracted; do not promise otherwise. Unauthorized/ineligible users cannot read even a retained response.

**Official scheduling constraint, additive to BE-04:** serialize practice configuration/release and official schedule creation/changes under the same approved-version lock. While practice is enabled, reject new sittings and rescheduling with 409 REVISION_CONFLICT; require disabling scheduled practice first. Once practice has become available, persist `contentReleasedAt` permanently. Reject further official sittings/rescheduling for that version even after practice is disabled. Re-evaluate the prior configuration before disabling or scheduling so an elapsed release cannot be hidden by turning the switch off. A new official examination needs an unexposed paper. Never reopen a closed sitting to bypass this restriction. Existing exact idempotent schedule replays may return their prior result without creating/changing anything.

## 2. Administrator configuration

`GET /admin/practice-exams?limit=25&cursor=...` returns `adminPracticeListSchema`: `{ items, nextCursor, serverNow }`. Include all approved papers in this school. Stable ordering: examId ascending. Default limit 25, valid range 1–100; opaque school-bound cursors; invalid limit/cursor returns 422 VALIDATION_ERROR. Pagination must not omit papers. Never create attempts on GET.

`GET /exams/:examId/practice-access` returns `practiceAccessSchema`:

```json
{
  "examId": "paper-id",
  "examVersion": 1,
  "title": "Mathematics",
  "revision": 1,
  "enabled": false,
  "releaseAt": null,
  "available": false,
  "blockers": ["Your administrator has not enabled practice."],
  "contentReleasedAt": null,
  "serverNow": "2026-10-17T07:00:00.000Z",
  "history": []
}
```

Start configuration revision at 1. `available` and `blockers` are authoritative derived values; include every currently failing gate with human-readable text, and return an empty blockers array when available. `contentReleasedAt` is null until release has occurred, then immutable. It is not proof a particular student viewed content. Time-derived gate changes do not increment the configuration revision.

`POST /exams/:examId/practice-access` body:

```json
{
  "revision": 1,
  "examVersion": 1,
  "enabled": true,
  "releaseAt": "2026-10-17T08:00:00.000Z",
  "reason": "Reviewed the paper and practice release."
}
```

Require current expected configuration revision and immutable approved version; mismatches return 409 REVISION_CONFLICT. Require a trimmed reason of 1–2000 characters; enabled requires a valid UTC release time. Past/current release times are permitted, subject to all gates. Disabled may retain a release time or set null. Invalid fields return 422 VALIDATION_ERROR. Do not accept client-supplied availability, history, actor or contentReleasedAt.

Atomically update configuration, increment revision once and append audit `{ enabled, releaseAt, reason, actorName, at }`. Persist school/actor ID/version as audit columns even though the DTO displays actorName. Return the full `practiceAccessSchema`, including history in ascending audit order. Lost-response replay returns the original successful response without another revision/audit event. Same key with changed canonical payload returns 409 REVISION_CONFLICT, even if expected revision is now stale.

## 3. Student list and attempt creation

`GET /me/practice?limit=25&cursor=...` returns `practiceListSchema`: `{ items, nextCursor, serverNow }`. One item per eligible approved paper/version, including locked papers. Same pagination limits and stable examId ordering as above; cursors are school/user scoped. Each item is:

```json
{
  "examId": "paper-id",
  "examVersion": 1,
  "title": "Mathematics",
  "available": true,
  "blockers": [],
  "releaseAt": "2026-10-17T08:00:00.000Z",
  "bestPercent": null,
  "completedCount": 0,
  "activeAttemptId": null
}
```

`bestPercent` is null before any valid completed attempt, including when unfinished attempts exist. `completedCount` counts valid completed attempts only. `activeAttemptId` is the most recently created valid active attempt for this student and paper/version, with attemptId as a deterministic tie breaker, otherwise null. A new attempt does not silently finish/delete older attempts; unfinished attempts do not count. They remain resumable by their owned IDs while access is permitted.

`POST /exams/:examId/practice-attempts` body `{ "examVersion": 1 }`, with a new retained idempotency key for each intentional new attempt. Recheck all gates and version. A new key creates a separate attempt; replay of the same request returns the original attempt response. Return 200 with `practiceAttemptSchema`. Concurrent starts with the same key create one row. Multiple distinct practice attempts are allowed; official one-attempt restrictions do not apply.

`GET /practice-attempts/:practiceAttemptId` returns the authoritative current `practiceAttemptSchema` after ownership, valid-version and release checks. It creates nothing. It supports resuming after navigation/reload and reconciling lost responses.

The attempt response is:

```json
{
  "practiceAttemptId": "practice-id",
  "examId": "paper-id",
  "examVersion": 1,
  "title": "Mathematics",
  "instructions": "Choose one answer.",
  "state": "active",
  "items": [
    {
      "itemId": "q1",
      "type": "true_false",
      "stem": "A triangle has three sides.",
      "marks": 2,
      "options": [
        { "id": "true", "text": "True" },
        { "id": "false", "text": "False" }
      ],
      "feedback": null
    }
  ],
  "score": null,
  "maxScore": 2,
  "percent": null,
  "completedAt": null,
  "bestPercent": null,
  "serverNow": "2026-10-17T08:00:00.000Z"
}
```

Use approved item/option order and immutable approved content; no new AI generation during practice. Support mcq_single and true_false, one stable option ID as an answer. Items are an explicit allowlist; before an answer is committed, feedback is null and that item's answer key/explanation/correctness must be absent everywhere else in the payload. No teacher review flags, draft text or private approval notes. Official encrypted packages remain answer-free under BE-02.

## 4. First answer and feedback

`POST /practice-attempts/:practiceAttemptId/answers` body `{ "itemId": "q1", "value": "true" }`, with retained key. Require a nonempty option ID belonging to that approved item; null, unknown options/items and foreign version data return 422 VALIDATION_ERROR. A skipped question cannot be completed as an implicit zero; the student must answer every item to complete practice.

In a transaction, lock the attempt/item or enforce an equivalent unique first-answer constraint. The first successfully committed value wins. Return the full attempt with that item's feedback:

```json
{
  "chosenOptionId": "true",
  "correctOptionId": "true",
  "correct": true,
  "explanation": "A triangle is a polygon with exactly three sides.",
  "earnedMarks": 2
}
```

Award full item marks for a correct answer, otherwise zero. Use the reviewed, approved explanation. Unanswered items still have feedback null. Never send another item's key/explanation merely because one item was answered. Recorded answers cannot be changed after feedback: a different value returns 409 ALREADY_ANSWERED even with a new key. The same value under a new key is a harmless read/reconciliation of existing feedback. Exact key/payload replay returns the original response. Changed payload under an existing key returns 409 REVISION_CONFLICT. Preserve correctness under simultaneous requests from multiple tabs/devices; no client clock or click order decides the winner.

The frontend retains the sent value/key while a request has an uncertain outcome, disables answer edits and offers Retry same answer. After navigation/reload it reads the server attempt before continuing. The backend's first-answer constraint remains authoritative. Do not claim local offline practice durability.

## 5. Completion, best score and isolation

`POST /practice-attempts/:practiceAttemptId/complete` body `{}`, retained key, returns the full attempt. If any item lacks a committed first answer, return 409 PRACTICE_INCOMPLETE without completing or updating best. Otherwise sum earned marks, set `percent = 100 * score / maxScore`, state completed and server completedAt. Persist the attempt completion and best-summary change atomically. Repeated completions under the same or different keys do not create a second completion or increment counts again. Completed feedback/answers are immutable through student endpoints.

Best score is the maximum percent over **valid completed attempts for this school/student/exam/version**, never the latest score, a partial score or a score from a different version. A lower repeat cannot reduce best. In a tie, retain the earliest completed attempt as the internal best-attempt reference, then smallest attemptId for identical timestamps. The public bestPercent remains the same. Preserve full numeric precision on the API; the frontend formats one decimal place.

Use locks/constraints that remain correct when two attempts complete simultaneously. Invalidated attempts no longer contribute to completedCount or best; return 404 for their detail/mutations. Any authorized backend correction/invalidation must audit the change and recompute the maximum from remaining valid completed attempts, including lowering/resetting best when necessary. The student endpoints do not expose a correction action; operational repair uses protected backend tooling, never edits official marks as a side effect.

Practice writes must not modify official answers, submission snapshots, receipts, recovery evidence/status, official score/rank, publication revisions, pass rates, primary-topic analytics or official CSV/PDF reports. Official results remain governed by BE-05, including after late recovery acceptance. Keep practice tables/relations distinct and verify before/after database values.

**Additive BE-05 payload:** every `GET /me/results` row now includes `practice: { examId, examVersion, available, blockedReason }` or null when no corresponding eligible approved paper exists. `blockedReason` is null when available, otherwise the joined safe blocker explanation. Keep all prior fields unchanged. Populate existing `bestPracticePercent` from the same valid completed maximum, separately from the official `result`. Retain a previously earned best score when practice is disabled. The client tolerates an absent practice property during rollout, but v0.8 backend delivery must supply it. No questions, keys or explanations in results payloads.

## 6. Idempotency and persistence

Scope keys to school, actor, resource and operation. Persist canonical request and successful response together with the mutation, surviving process restart. Failed validation does not consume a successful replay record. Reauthorize and check current student release/validity before returning a stored response; revocation must not leak feedback through a replay. Administrator configuration replay is allowed after subsequent configuration revisions and returns the original audit result without changing current settings. After any stale replay, GET returns current truth.

Never use the browser's device identity as authentication. Practice does not share official device binding/generation, timing, finalization or recovery routes. Separate practice throttling and idempotency storage from official submission capacity. Return ordinary 429/503 errors using the common contract when needed; do not silently drop committed practice work.

## 7. Implementation order and required tests

1. Add versioned access/audit, practice attempt, first-answer and completion/best persistence. Include school/user/version constraints and rollback-safe idempotency records.
2. Implement admin/list/access endpoints and shared gate calculation. Apply the scheduling interlock to BE-04. Test enable/disable/release versus scheduling/publication races.
3. Implement student list/start/read, then first-answer feedback and completion. Add the additive student-results metadata and best summary.
4. Connect the existing frontend with mocks disabled. Verify EAT input conversion and all routes with actual cookies/MFA/CSRF.
5. Run and return real-database evidence for every case below.

Required cases: wrong role, incomplete MFA, foreign school/student IDs, inactive membership and missing roster; exact release boundary; unpublished/planned-only results; a later related sitting and a not-yet-created accommodated attempt; no early questions/keys/explanations; revocation before reads and response replays; re-enable/resume; pagination beyond 25 records; stale configuration, lost response and changed-key-payload conflicts; first wrong answer followed by a correct change; simultaneous conflicting answers; no unanswered feedback leakage; invalid/null option input; incomplete completion; abandoned attempt; completed scores 100%, 0%, 50% retain best 100%; tied completions; simultaneous different-attempt completions; duplicate completion; correction/invalidation recomputation; version isolation; restart and transaction rollback; immutable official database rows and exported reports; no rescheduling/reuse after practice release, including after disable. Use independent requests/connections for database races; a single in-memory event loop does not prove concurrency safety.

## 8. Required backend report

Return contract version v0.8, code commit, migration identifiers and exact implemented endpoints. Include staging URL/allowed frontend origin, private synthetic-account provisioning instructions, integration configuration, actual test commands/results, and sanitized before/after database assertions for first-answer races, completion/best races, rollback/restart/idempotency, tenant isolation and unchanged official records. Explain how scheduled release and BE-04 scheduling share a lock and how all roster accommodations are included. List every incomplete item or concrete blocker with affected section, evidence and next action. Continue unaffected work. Do not report demo success as production acceptance or 500-student capacity proof.
