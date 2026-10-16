# Nexora API contract v0.11

## Extra-time accommodations addendum

v0.11, issued 15 October 2026: implement [BE-10](backend-accommodations-task.md). New administrator roster read and accommodation mutation use accommodation-schemas.ts and admin/api.ts. BE-04 session objects now require latestDeadlineAt; history adds accommodation_changed. Approved allowances can be edited only before preparation/delivery, with revisions, audit and replay. This narrow change supersedes earlier BE-04 accommodation immutability wording. Preserve deadlines throughout student delivery, rescheduling, monitoring, results and practice. Earlier addenda are historical; unchanged requirements remain dependencies. Real backend acceptance is outstanding.

## Live monitoring and device replacement addendum

v0.10, issued 14 October 2026: implement [backend-monitor-task.md](backend-monitor-task.md), BE-09. It issues admin sitting/roster/attempt-history reads and completes the browser replacement workflow. Exact DTOs/calls are src/features/exams/monitor/schemas.ts and api.ts. This explicitly supersedes the earlier transfer wire shape: POST /attempts/:id/device-transfer now requires `{newDeviceId,expectedDeviceGeneration,reason}`; its response adds deadlineAt/transferredAt/transferId to attemptId/deviceGeneration/state. Reject the old unguarded body. Preserve one atomic generation increment/audit, server-only sequence-zero answer inheritance, unchanged deadline and old-generation evidence. Admin reads never update student contact or fabricate submissions. Other student/auth/runner payloads stay unchanged. These are mandatory owner-issued requirements; real backend acceptance remains outstanding. Historical addenda below describe their own versions.

## School setup and accounts addendum

v0.9, issued 14 October 2026: implement [backend-school-task.md](backend-school-task.md), BE-08. It issues administrator class/subject/account/assignment management, CSV roster preview and atomic import, one-time credential generation, audited password reset with session revocation, and directory audit reads. Exact DTOs/calls are src/features/school/schemas.ts and api.ts. Credential issuance is an explicit exception to normal response replay: first success returns passwords; later identical requests return the same metadata and affected account identities with credentials null. Never persist plaintext passwords for replay. Preserve frozen rosters, existing exam evidence and teacher ownership across directory changes. Earlier issued payloads remain unchanged. These requirements supersede the unspecified school-directory inventory below. Real backend acceptance remains outstanding.

## Practice addendum

v0.8, issued 14 October 2026: implement [backend-practice-task.md](backend-practice-task.md), BE-07. It issues administrator practice configuration/list reads, student eligible-paper/attempt reads, first-answer feedback and atomic repeated-attempt completion/best scoring. Executable wire shapes/calls are src/features/practice/schemas.ts and api.ts. GET /me/results gains the additive practice metadata field in src/features/results/schemas.ts; bestPracticePercent now uses valid completed practice attempts. BE-04 scheduling must reject changes while practice is enabled and permanently reject reuse after practice release. Earlier official exam, grading, receipt and recovery payloads stay unchanged. These are mandatory owner-issued requirements; real backend acceptance remains outstanding. Historical increment notes follow.

## Recovery review addendum

v0.7, issued 14 October 2026: implement [backend-recovery-task.md](backend-recovery-task.md), BE-06. It issues administrator recovery list/detail reads and completes the existing BE-02 decision mutation, immutable evidence, receipt correlation, audit/supersession and BE-05 candidate revision invalidation. Executable shapes/calls are src/features/exams/recovery/schemas.ts and api.ts. Student/auth and v0.6 results payloads remain unchanged. This is mandatory implementation work, not a claim of real backend integration. Historical increment notes follow.

## Official results addendum

v0.6, issued 14 October 2026: implement [backend-results-task.md](backend-results-task.md) (BE-05), including the executable src/features/results/schemas.ts and api.ts. It defines official grading, revision snapshots, staff result lists/analytics, administrator publication and explicit unresolved-attempt exclusions, student release gates, complete scoped CSV and typed printable reports. These definitions supersede the previously unspecified publication/report/student-results inventory rows below. Earlier v0.5/v0.4/v0.3 interfaces are unchanged. Backend approval is not requested; real backend implementation remains unverified. The status paragraphs below document earlier increments.

Status: issued implementation requirements, 14 October 2026. Current contract is v0.11 (BE-10 extra-time accommodations); earlier increments remain dependencies except where explicitly revised by the addenda above. Backend approval is not requested. No backend implementation was inspected.

## Administrator approval and scheduling addendum

Read [backend-admin-exam-task.md](backend-admin-exam-task.md) as part of v0.5. It issues school-admin paper list/detail, approval/return, package status/retry, class roster snapshots, session creation and pre-preparation rescheduling. Executable shapes and calls are in src/features/exams/admin/schemas.ts and api.ts. It connects BE-03 submissions to BE-02 student sittings. Planned results dates are not publication authorization; practice access is separate. These explicit definitions supersede the previously unspecified approval/scheduling rows below. Result publication, monitoring, recovery-list and directory details remain later increments.

## Teacher preparation addendum

Read [backend-teacher-exam-task.md](backend-teacher-exam-task.md) as part of v0.4, retained in v0.5. It issues teaching-assignment and teacher exam list/detail reads, draft metadata, multipart imports, durable AI job progress/retry, revision-protected question review and submission for administrator approval. Executable teacher shapes are in src/features/exams/authoring/schemas.ts. Its explicit definitions supersede the previously unspecified draft/import/review/submission rows below. Teacher authority is unchanged.

Authority: master plan v3.0, sections 8-12. Its product rules and endpoint paths are requirements. Exact JSON fields, enum spelling, CSRF bootstrap, device binding, pagination and binary encodings below are required project-owner decisions. Later endpoint payloads are not yet issued; the project owner will supply them before affected interface implementation.

## Student-delivery addendum

Read [backend-student-exam-task.md](backend-student-exam-task.md) as part of this contract. It issues GET /me/exams/:sessionId and POST /auth/device; defines enrollment/transfer, canonical final digests, receipt correlation, recovery state and operator-assisted admin MFA setup. Its explicit clarifications supersede the earlier broad descriptions below. Auth endpoint JSON used by the implemented frontend is unchanged. Synthetic interoperability values are in [student-exam-v1.json](fixtures/student-exam-v1.json).

## Common conventions

- Prefix /api/v1; all paths below omit it. Prefer same-origin /api. Production uses HTTPS. Cross-origin requests require an exact origin allowlist and credentials, never wildcard CORS.
- JSON success bodies are direct, without a data wrapper. Empty successes use 204. Dates are UTC ISO 8601, IDs opaque strings (UUIDs for persisted records), marks positive integers, sequences nonnegative integers. CamelCase fields.
- X-Request-Id on responses; sensitive responses use Cache-Control: private, no-store. No private keys, answer payloads or credentials in logs/errors.
- Client uses credentials: include. Server derives school/role from the session. Cross-school IDs return 404; role violations return 403. Downloads and exports have the same checks.
- lists: ?limit=25&cursor=...; limit 1-100; { items: [], nextCursor: null }. Cursors are opaque and scoped. GET never creates attempts.
- Mutations require an allowed Origin and session-bound X-CSRF-Token. Keep CSRF tokens in memory; rotate at auth transitions. Failed checks return 403 CSRF_INVALID. Never automatically replay a mutation just because its token changed.
- Idempotency-Key is a retained UUID scoped to school, actor and operation. Same key/canonical payload returns original result; conflicting reuse returns 409 REVISION_CONFLICT. Final receipt replays survive deadlines, session expiry and process restart, with authentication still required.
- SHA-256 digests are lowercase hex. Use the canonical serialization and supplied digest vector in BE-02 section 7; backend must reproduce the vector before integration. Retain the exact final request and key rather than rebuilding payloads on retry.

Error shape:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "An answer is invalid.",
  "details": [{ "path": "answers.0.value", "message": "Unknown option." }],
  "requestId": "opaque-id"
}
```

details is always an array. optional context: { serverNow, retryAt }, UTC timestamps for time-gated operations.

| HTTP                   | Codes                                                                                                          | Behavior                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 401                    | AUTH_REQUIRED                                                                                                  | Reauthenticate; preserve pending exam work; no refresh loop |
| 403                    | FORBIDDEN, CSRF_INVALID                                                                                        | Access or session revalidation action                       |
| 404                    | NOT_FOUND                                                                                                      | Absent or inaccessible resource                             |
| 409                    | REVISION_CONFLICT, DEVICE_REPLACED, ALREADY_FINALIZED                                                          | Stop conflicting writes and reconcile                       |
| 409 (required mapping) | NOT_PREPARING, NOT_STARTED, AI_REVIEW_REQUIRED, RESULTS_NOT_RELEASED, PRACTICE_NOT_RELEASED, RECOVERY_REQUIRED | Domain state prevents operation                             |
| 413 / 422              | PAYLOAD_TOO_LARGE / VALIDATION_ERROR                                                                           | Do not retry unchanged invalid input                        |
| 429                    | RATE_LIMITED                                                                                                   | Honor Retry-After seconds                                   |
| 500 / 503              | INTERNAL_ERROR / TEMPORARILY_UNAVAILABLE                                                                       | Bounded backoff, retained evidence                          |

## Authentication

GET /auth/csrf establishes an anonymous CSRF session if needed and returns { csrfToken, serverNow }. This protects login itself. Session cookies are opaque, HttpOnly, Secure in production, SameSite=Lax; database stores token hashes. Local HTTP cookie settings must be explicitly development-only.

POST /auth/login body { loginId, password }:

- 200 { status: "authenticated" }, rotated cookie; fetch /auth/me next.
- Admin: 200 { status: "mfa_required", csrfToken }, short-lived challenge cookie, no privileged access.
- Invalid credentials: generic 401 AUTH_REQUIRED; school-aware rate limiting.

POST /auth/mfa/verify body { code }, using challenge CSRF token. Use TOTP codes. Success 200 { status: "authenticated" } and rotated cookie. Bad code 422, expired challenge 401. Use the protected operator-assisted TOTP enrollment/recovery procedure in BE-02 section 9; never bypass MFA.

GET /auth/me response:

```json
{
  "user": { "id": "uuid", "loginId": "SCH-001", "displayName": "Test Student", "role": "student" },
  "school": { "id": "uuid", "name": "Test School", "timezone": "Africa/Addis_Ababa" },
  "csrfToken": "opaque",
  "serverNow": "2026-10-17T06:00:00Z"
}
```

Roles: student, teacher, school_admin. Operator provisioning is a protected backend command, not a browser role. Anonymous/unfinished MFA gets 401. POST /auth/logout revokes session, clears cookie, returns 204. Clear query/auth caches but retain unresolved IndexedDB evidence partitioned by school/user/attempt and inaccessible to another logged-in user.

## Assigned exams

GET /me/exams, student only, list envelope plus serverNow. Example item:

```json
{
  "examId": "uuid",
  "sessionId": "uuid",
  "title": "Mathematics",
  "subjectName": "Mathematics",
  "className": "Grade 10 A",
  "durationMinutes": 60,
  "preparationVisibleAt": "2026-10-17T06:00:00Z",
  "startsAt": "2026-10-17T06:10:00Z",
  "endsAt": "2026-10-17T07:10:00Z",
  "deadlineAt": "2026-10-17T07:10:00Z",
  "scheduleRevision": 1,
  "phase": "preparing",
  "attemptId": null,
  "attemptState": null
}
```

phase: scheduled | preparing | open | ended. attemptState is null or a backend state below. No questions/keys/scores. deadlineAt includes accommodation; endsAt is common. Links never grant eligibility.

## Attempt creation and reconciliation

POST /sessions/:id/attempts, Idempotency-Key, body { deviceId: "browser-generated-UUID" }. 201 first creation, 200 existing attempt. Unique school/session/student even with different request keys. Create only between preparation and student deadline; existing attempts may be reconciled later without changing their deadline.

deviceId is a device identifier, not authentication. Bind it server-side to a random HttpOnly device credential. Active attempt operations verify ownership and binding; BE-02 section 5 defines explicit read-only receipt replay and disputed-recovery exceptions. Generation numbers alone are not proof. A different device needs admin transfer.

Attempt response, also returned by GET /attempts/:id for online reload:

```json
{
  "attemptId": "uuid",
  "sessionId": "uuid",
  "examVersion": 1,
  "scheduleRevision": 1,
  "deviceGeneration": 1,
  "state": "preparing",
  "serverNow": "2026-10-17T06:00:00Z",
  "startsAt": "2026-10-17T06:10:00Z",
  "deadlineAt": "2026-10-17T07:10:00Z",
  "finalAcceptUntil": "2026-10-17T07:10:05Z",
  "lastServerSaveAt": null,
  "highestAcceptedSeq": 0,
  "answers": [],
  "receipt": null,
  "recovery": null
}
```

Backend states: preparing | active | awaiting_upload | recovery_pending | submitted | invalidated. Separate from local UI states. answers contains confirmed { itemId, value, clientSeq } records, empty before unlock, never keys. Reconcile by revisions without overwriting newer local work. receipt is the receipt below or null; recovery is { recoveryId, status, receivedAt } or null. Closed state alone never proves a snapshot was received.

## Package and unlock

GET /attempts/:id/package: authorized bound student only, from preparation through student deadline. response:

```json
{
  "packageId": "uuid",
  "examVersion": 1,
  "scheduleRevision": 1,
  "algorithm": "AES-GCM",
  "iv": "base64url-12-byte-nonce",
  "ciphertext": "base64url-ciphertext-with-appended-16-byte-tag",
  "sha256": "lowercase-hex-hash-of-ciphertext-bytes"
}
```

encoding: unpadded base64url, AES-256-GCM, 128-bit tag, UTF-8 JSON plaintext, no additional authenticated data. Fresh key and unique nonce per encrypted package. Store authorized ciphertext explicitly in IndexedDB; do not indiscriminately cache the endpoint. Ready requires matching hash, available versioned app assets and a successful local storage transaction.

POST /attempts/:id/unlock body { packageId, examVersion, scheduleRevision, deviceGeneration }. Success 200:

```json
{
  "packageId": "uuid",
  "key": "base64url-32-byte-key",
  "serverNow": "2026-10-17T06:10:00Z",
  "deadlineAt": "2026-10-17T07:10:00Z",
  "finalAcceptUntil": "2026-10-17T07:10:05Z",
  "deviceGeneration": 1,
  "questionOrder": ["q1"],
  "optionOrders": { "q1": ["true", "false"] }
}
```

Check identity/school/roster/approval/package/device/time. Before start: NOT_STARTED; after deadline: RECOVERY_REQUIRED, no key. Repeat unlock before deadline is safe, no timer reset. Orders are generated once by server and persisted.

Plaintext allowlist: { examVersion, title, instructions, items }. Item: { itemId, type, stem, marks, options }; option: { id, text }. Types: mcq_single | true_false. True/false IDs: "true", "false"; MCQ stable option IDs from package. AnswerValue is option ID or null. No key, explanation, correctness or private review metadata. Validate order lists cover each item/option exactly once. Backend supplies a known encryption fixture before integration.

## Interim saves

POST /attempts/:id/answers:

```json
{
  "examVersion": 1,
  "scheduleRevision": 1,
  "deviceGeneration": 1,
  "answers": [{ "itemId": "q1", "value": "true", "clientSeq": 1 }]
}
```

Each edit increases sequence within attempt/generation. The batch validates atomically under attempt row lock. Identical revisions replay acknowledgements; same revision/different value is REVISION_CONFLICT. Older revisions cannot replace newer ones. Reject duplicate items, invalid options, versions and stale devices. After deadline: RECOVERY_REQUIRED; after submission: ALREADY_FINALIZED.

200 response:

```json
{
  "acknowledged": [{ "itemId": "q1", "clientSeq": 1 }],
  "superseded": [],
  "highestAcceptedSeq": 1,
  "lastServerSaveAt": "2026-10-17T06:11:00Z",
  "serverNow": "2026-10-17T06:11:00Z"
}
```

superseded records: { itemId, clientSeq, currentSeq }; do not falsely acknowledge old content. Reconcile authoritative newer revision before retiring superseded local evidence. Backend retains sufficient revision evidence to detect conflicting retries. Client clears only specific acknowledged revisions, never merely sent entries; a late response cannot erase a newer edit.

## Final submission and receipt

POST /attempts/:id/submit, one retained Idempotency-Key:

```json
{
  "examVersion": 1,
  "scheduleRevision": 1,
  "deviceGeneration": 1,
  "finalSeq": 42,
  "answers": [{ "itemId": "q1", "value": "true" }]
}
```

Example is a one-item paper. Include every item exactly once, null for unanswered. Reject missing/extra/duplicate items, invalid options and finalSeq below highest accepted revision. Always authenticate ownership. For an existing committed request, identical key/payload returns receipt before timing checks, even after deadline; conflicting reuse is 409. Different final request after closure returns ALREADY_FINALIZED and requires reconciliation.

Lock attempt and atomically commit complete snapshot, deterministic score, sequence, digest and unique receipt. Later saves cannot mutate it. Only respond after commit. 200 first acceptance and replay:

```json
{
  "status": "submitted",
  "receiptId": "uuid",
  "acceptedAt": "2026-10-17T07:10:02Z",
  "snapshotDigest": "lowercase-sha256-hex"
}
```

No unreleased scores in receipt. Complete request must arrive by deadline + five seconds, measured by server; UI locks at deadline. Beyond allowance return RECOVERY_REQUIRED. Timeout is ambiguous: resend SAME key/body first because commit may have succeeded.

GET /attempts/:id/receipt: 200 { attemptId, state, receipt, recovery }. receipt is null unless committed. receipt-read additions: idempotencyKey and finalSeq inside receipt, allowing local correlation. Never discard a different unmatched local final payload because some receipt exists. No endpoint fabricates submission from interim saves.

## Recovery and transfer

POST /attempts/:id/recovery: frozen final fields plus nonempty reason, separate retained Idempotency-Key. 201 first/200 replay { status: "recovery_pending", recoveryId, receivedAt }. Store immutable evidence separately from timely saves. Owner-authenticated stale/disputed device evidence may be retained for review but never accepted as an ordinary write. Existing official submission returns ALREADY_FINALIZED for reconciliation.

POST /recovery/:id/decision, admin, Idempotency-Key, { decision: "accept" | "reject", reason }. 200 { recoveryId, decision, decidedAt, resultRevision }, revision null if rejected. Acceptance creates an audited official result and committed receipt; attempt reads then show submitted. Changes after publication create a new result/publication revision, never silently replace history or auto-release scores.

POST /attempts/:id/device-transfer, admin, Idempotency-Key, { newDeviceId, reason }. 200 { attemptId, deviceGeneration, state }. Lock same attempt row; reject closed/invalidated attempts. Use the POST /auth/device enrollment and admin transfer procedure in BE-02 section 5. Invalidate old device writes/unlocks; transfer no unconfirmed local work automatically and never extend deadline.

## Later endpoint inventory: detailed payloads not yet issued

| Workflow        | Endpoints                                                                           | Authority                                              |
| --------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Directory       | GET/POST /classes, /subjects, /teachers; assignment routes TBD                      | Admin writes, scoped teacher reads                     |
| Students        | POST /students/import, /students/generate-credentials, /students/:id/reset-password | Admin; preview, one-time issuance, revocation on reset |
| Draft/import    | POST /exams; PATCH /exams/:id; POST /imports; GET /imports/:id                      | Teacher; bounded DOCX/XLSX validation                  |
| Review          | GET/PATCH /exams/:id/items; POST /imports/:id/ai-retry                              | Scoped teacher; revisions, AI never changes key        |
| Approval        | POST /exams/:id/submit-for-approval, /approve, /return                              | Teacher submits, admin approves immutable version      |
| Scheduling      | POST /exams/:id/sessions; PATCH /sessions/:id/schedule                              | Admin; fixed start and frozen roster                   |
| Publication     | POST /sessions/:id/results-publication                                              | Admin; time, approval and recovery gates               |
| Reports         | GET /sessions/:id/results, /analytics; GET /exports/results.csv, /exports/report    | Admin school-wide; teacher assigned scope              |
| Student results | GET /me/results                                                                     | Own released scores/rank, separate best practice       |
| Practice access | POST /exams/:id/practice-access                                                     | Admin; official release and related sittings closed    |
| Practice        | POST /exams/:id/practice-attempts; POST /practice-attempts/:id/answers, /complete   | First-answer scoring; atomic completed maximum         |
| Operations      | GET /health, /ready                                                                 | Minimal liveness/readiness, no secrets                 |

Current status (15 October): admin monitoring/recovery-list reads, directory assignments, staff exam list/detail routes and their executable schemas have been issued through BE-03 to BE-09. Student detail, device enrollment, final digest and operator-assisted MFA are specified in BE-02. The master-plan audit identifies accommodation configuration and verified preparation acknowledgement as remaining contract work; no new payloads for those operations are issued here. Existing v0.10 interfaces remain unchanged.

## Contract control

The project owner controls these interfaces. Implement specified behavior as written; do not substitute alternative wire formats. Report missing details or technical blockers with the affected endpoint, evidence and impact. The project owner issues binding clarifications or revisions. Continue unaffected work. Backend internal choices remain with its developer where they preserve requirements. Issued requirements do not imply completed implementation.
