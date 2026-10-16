# Backend task BE-02: student exam delivery

Issued: 13 October 2026. Required implementation, not a request for approval.

## 1. Objective and authority

Deliver the real backend for this complete student flow:

**Login -> assigned exams -> preparation -> timed unlock -> answer saves -> final snapshot -> committed receipt, or explicit late recovery.**

The master plan v3.0 remains the product authority. This task is the binding student-delivery addendum to API contract v0.3. It resolves the specific open details listed below and takes precedence over earlier wire descriptions where explicitly revised. Unchanged request/response shapes remain in api-contract.md. Read exam-engine.md for browser behavior and joint acceptance cases. Do not change paths, fields, timing rules or outcomes independently. Report concrete gaps or blockers; the project owner issues any revision. Internal code organization remains the backend developer's responsibility.

This is a backend task. Do not rebuild frontend screens. Do not wait for the entire content-management system: seed an approved objective paper to integrate this path first. The seeded paper is an integration fixture, not proof that teacher import, AI or approval is finished.

## 2. Current frontend and delivery order

The frontend login, admin MFA screen, session restoration, role guards and dashboard shells work with synthetic mocks. Real backend integration is unverified. Student exam screens are the next frontend slice.

Deliver in three increments, reporting each when ready:

1. **BE-02A: authentication, assigned list, schedule detail, device enrollment, attempt, package and unlock.** This unblocks the next frontend work immediately.
2. **BE-02B: revision saves, atomic final submission, receipt reads and canonical digest fixtures.** This establishes the first real end-to-end sitting.
3. **BE-02C: late recovery, admin decision and device transfer, including races.** This completes the delivery/recovery path before release acceptance.

All three are required. Do not postpone A until unrelated teacher/results features are complete. Integrate against a real PostgreSQL database, with migrations, tenant constraints/RLS and a restricted runtime role. Preserve the master plan's NestJS modular backend unless a working equivalent already exists.

## 3. Required endpoints

All paths have prefix `/api/v1`. Responses, cookies, CSRF, credentials and errors follow api-contract.md. Every protected operation rechecks active membership and school ownership. Teacher/admin accounts cannot impersonate a student by sending a student ID.

| Increment | Method and path | Required behavior |
| --- | --- | --- |
| A | GET /auth/csrf; POST /auth/login; GET /auth/me; POST /auth/mfa/verify; POST /auth/logout | Real opaque cookie authentication; no JWT refresh substitute; MFA before admin access |
| A | GET /me/exams | Only current student's eligible sittings, with server time and authoritative attempt state |
| A | GET /me/exams/:sessionId | New: read a single assigned sitting without creating an attempt |
| A | POST /auth/device | New: enroll/recover this authenticated student's browser device binding |
| A | POST /sessions/:sessionId/attempts | One attempt per student/sitting, persistent generation and deadline |
| A | GET /attempts/:attemptId | Online state/revision reconciliation; never overwrite newer client work implicitly |
| A | GET /attempts/:attemptId/package | Private encrypted, answer-free package in the preparation window |
| A | POST /attempts/:attemptId/unlock | Return key only at/after start, before deadline, to the active bound device |
| B | POST /attempts/:attemptId/answers | Atomic revision batch; explicit acknowledgements and conflicts |
| B | POST /attempts/:attemptId/submit | Complete final snapshot, score and unique receipt committed together |
| B | GET /attempts/:attemptId/receipt | Actual committed receipt or explicit state with null receipt |
| C | POST /attempts/:attemptId/recovery | Preserve late/disputed evidence separately, without falsely submitting |
| C | POST /recovery/:recoveryId/decision | School admin accepts/rejects with audit reason |
| C | POST /attempts/:attemptId/device-transfer | School admin changes the active enrolled device atomically |
| A | GET /health; GET /ready | Minimal liveness and database/private-storage readiness |

Every mutation uses Origin validation and X-CSRF-Token. Idempotency-Key is required for attempt creation, final submission, recovery upload, recovery decision and device transfer. Device enrollment is naturally idempotent under its device ID and valid credential, as described below. Do not require a new idempotency header on login, MFA, logout or answer batches: the current frontend follows their existing contract.

## 4. Assigned list and detail: exact clarification

GET /me/exams returns `{ "items": [...], "nextCursor": null, "serverNow": "UTC timestamp" }`. Keep every item field in v0.2's assigned-exam example. Sort by startsAt ascending, then sessionId ascending; use those values in an opaque cursor. Default limit 25, maximum 100. Return an empty array for no assignments, not an error. Validate malformed cursors/limits with 422. Return all eligible scheduled/completed sittings through pagination; do not silently hide completed work.

GET /me/exams/:sessionId returns `{ "exam": <the same item shape>, "serverNow": "UTC timestamp" }`. It must not create an attempt. Ineligible, wrong-school or absent ID: 404 NOT_FOUND. This endpoint permits direct navigation/reload before preparation opens. It exposes no questions, key, explanation or unreleased mark.

Use the student's accommodated deadline when computing phase:

- scheduled: now < preparationVisibleAt.
- preparing: preparationVisibleAt <= now < startsAt.
- open: startsAt <= now < deadlineAt.
- ended: now >= deadlineAt.

phase describes time; attemptState independently describes participation. A student who submitted early may have phase open and attemptState submitted. Never offer a new attempt for that student. Generate one serverNow for each response.

## 5. Browser device enrollment and replacement

### Enrollment

POST /auth/device body `{ "deviceId": "client-generated UUID" }`; student-only; success 200 `{ "deviceId": "same UUID" }`.

On first enrollment of a new browser ID, create a cryptographically random 32-byte device credential, store only its SHA-256 hash and issue a host-only `__Host-nexora_device` cookie with Secure, HttpOnly, SameSite=Lax, Path=/ and 30-day Max-Age. Use an explicitly development-only non-Secure cookie name/configuration for local HTTP. Never expose the credential in JSON. Browser IDs and generation integers are not authentication secrets.

Persist device ID, credential hash, expiry/revocation and the verified school/student enrollment. Bind the cookie to the device ID and keep an explicit school/student/device enrollment relation. On a shared browser, a newly authenticated student may enroll that same device using its valid cookie; this never grants another student's attempt access. Protect concurrent enrollment with uniqueness constraints.

Repeat enrollment with the existing valid credential is safe. An existing ID without its matching cookie returns 409 DEVICE_REPLACED; do not mint a replacement credential for the same ID. Missing/expired browser credential requires a fresh browser ID/enrollment and admin transfer for an existing attempt. Session logout/password reset does not delete the device record; reauthentication still checks active membership. Device-cookie expiry cannot extend an attempt deadline.

The frontend stores only the non-secret device ID in its local device repository. It calls enrollment before creating/recovering a writable attempt. The attempt creation request's deviceId must have a valid cookie and enrollment for the current student. Unknown enrollment or mismatching device: 409 DEVICE_REPLACED. School/student authorization always comes first.

### Transfer

1. Student signs in on the replacement browser and calls POST /auth/device for a new ID. That browser cannot take over the old attempt automatically.
2. School staff privately obtain that non-secret new device ID. Admin calls POST /attempts/:id/device-transfer with `{ newDeviceId, reason }` and Idempotency-Key.
3. Verify that the new ID is already enrolled by that attempt's student in the same school. Reject unregistered or other-student IDs with 422 VALIDATION_ERROR without disclosing their owner.
4. Lock the attempt; require no committed submission/invalidation and now < deadlineAt. After deadline return RECOVERY_REQUIRED. Increment deviceGeneration once, bind the new device and retain an audit event. Identical retry returns the same generation.
5. Carry the latest timely server-confirmed answers into the new generation as clientSeq 0; set highestAcceptedSeq to 0. Preserve old-generation revision history separately as evidence. Never copy unreceived old-device answers automatically. State becomes preparing until the new device unlocks, even if common start has passed. Do not change package version, order, schedule or deadline.
6. Return `{ attemptId, deviceGeneration, state }`. Replacement browser calls GET /attempts/:id, downloads if needed, and unlocks before editing. No transfer token or additional public claim endpoint is required.

For active operations (attempt recovery for writing, package, unlock, saves, new submit), enforce current device binding. For authenticated owner receipt reads and identical already-committed submission replays, allow retrieval even after device replacement/expiry; they cannot mutate work or return a key. For recovery uploads, preserve owner-authenticated old-generation evidence for review rather than treating it as a current-generation save. These are explicit exceptions to v0.2's broad device-check wording.

## 6. Timing, state and package integrity

Compute and persist startsAt = preparationVisibleAt + ten minutes; endsAt = startsAt + duration; deadlineAt = endsAt + approved accommodation; finalAcceptUntil = deadlineAt + five seconds. Roster/accommodation/version/schedule freeze before preparation. Store UTC; do not accept client-derived deadlines.

Before preparation, attempt creation/package is NOT_PREPARING. Unlock before start is NOT_STARTED. New attempt creation and unlock require now < deadlineAt. Ordinary saves require the attempt to have unlocked and the backend validation time to be before deadline. Already finalized ordinary writes return ALREADY_FINALIZED. Invalidated attempts return ALREADY_FINALIZED with their actual invalidated state available through reconciliation; never imply a receipt exists.

For final submission capture server receivedAt immediately after the complete request body arrives, before waiting on the database row lock. Require startsAt <= receivedAt <= finalAcceptUntil for a new normal submission, and verify the attempt previously unlocked. An earlier partial body does not establish timely receipt. A valid on-time complete body may commit after the deadline due to lock contention. Already-committed identical replays bypass timing checks, not authentication.

Use the v0.2 AES-256-GCM transport exactly. Validate 12-byte nonce, 32-byte key, 16-byte appended tag, unpadded base64url and SHA-256 over ciphertext bytes including tag. Separate the private grading representation from the explicit student allowlist. Review field exclusion recursively; do not serialize a private entity and delete a few known fields. Preserve canonical item/option IDs and backend-generated order on retries/reloads/transfers.

Deliver a fixture compatible with `docs/fixtures/student-exam-v1.json`. All deterministic keys/nonces there are synthetic interoperability test material only. Real packages require fresh random keys and unique nonces. Never use fixture keys for school data.

## 7. Saves and final digest: exact clarification

Use one increasing safe integer clientSeq for each edit within a device generation. Positive revisions identify new edits. Sequence 0 is reserved for inherited confirmed answers after transfer. Reject a sequence reused for a different item or value in the same generation with REVISION_CONFLICT. Retain revision fingerprints so an old conflicting replay can still be detected. An unknown older revision may be acknowledged as superseded only when the same item's newer revision is already stored; it cannot overwrite it.

Reject the entire batch on any validation/conflicting-reuse error. In the acknowledgement shape, superseded entries are not claims that their payload was saved. finalSeq must be a nonnegative safe integer at least as high as every accepted revision in the active generation. Lock saves, submit, recovery acceptance and device transfer on the same attempt row. Never overwrite a committed final snapshot.

### Canonical snapshotDigest algorithm

This replaces the earlier open serializer decision. Validate all final fields first. Item IDs, option IDs and attempt IDs use case-sensitive ASCII letters, digits, hyphen or underscore, 1-128 characters; UUID strings comply. No locale-dependent sorting or Unicode normalization.

Build this JSON array, in exactly this order:

```text
[
  "nexora-final-v1",
  attemptId,
  examVersion,
  scheduleRevision,
  deviceGeneration,
  finalSeq,
  [[itemId, valueOrNull], ...]
]
```

Sort the answer pairs by itemId in ascending ASCII byte order. Include every item exactly once, including nulls. Encode with standard JSON compact serialization, no whitespace, no BOM or trailing newline, then UTF-8, then SHA-256 lowercase hexadecimal. Integers serialize as decimal JSON numbers; no floats/NaN/Infinity. The finalSeq and version integers must be safe integers. Whitespace/key order in the HTTP body does not change this digest; canonical item identity/value does. Compare submitted item membership to the frozen exam before hashing. Idempotency-Key is not part of snapshotDigest; keep it as a separate request identity.

The fixture contains literal canonicalUtf8 and expected snapshotDigest. Reproduce them byte-for-byte in a backend test. Hash the recovery's original frozen final fields by the same algorithm; reason and staff decision are separately stored audit data, not part of the answer digest.

### Receipt correlation

The POST /submit response remains unchanged. Receipt objects returned inside GET /attempts/:id and GET /attempts/:id/receipt must contain `{ status, receiptId, acceptedAt, snapshotDigest, idempotencyKey, finalSeq }`. For normal acceptance idempotencyKey is the original final-submission request key. Retain immutable snapshot/digest and receipt identity with the academic record; do not expire idempotency replay records during the required recovery period or while the record is retained. Authenticate all reads.

For admin-accepted recovery, create the receipt in the decision transaction with the recovery-upload idempotency key and original finalSeq/digest; acceptedAt is the decision commit time. GET reconciliation lets the browser match its recovery evidence. Recovery decisions must not return unreleased scores to students.

## 8. Recovery state clarification

Recovery upload opens only when server now > finalAcceptUntil. Before then return 409 REVISION_CONFLICT with a message to retain disputed evidence and use normal submission on the active device; include context.retryAt for the first millisecond after finalAcceptUntil. This prevents an old replaced browser from interrupting the active student through an early recovery request. Normal late /submit returns 409 RECOVERY_REQUIRED without creating an official receipt. Browser then POSTs the retained complete payload plus reason to /recovery using a separate stable key. Validate ownership, known exam/schedule/version/item/options and safe sequences, but permit an old known device generation as disputed evidence. Reject fabricated unknown generations or foreign items. Record the current generation and latest timely save alongside the upload for review.

The first accepted recovery upload moves the attempt to recovery_pending. While this state is unresolved, reject new ordinary saves/submissions/transfers with RECOVERY_REQUIRED; identical committed receipt replays remain readable. Allow additional immutable disputed uploads with distinct keys, without overwriting earlier evidence. The response remains `{ status: "recovery_pending", recoveryId, receivedAt }`. Never say Submitted merely because recovery storage succeeded.

In attempt/receipt reads, recovery is null or `{ recoveryId, status, receivedAt }`, with status `recovery_pending | accepted | rejected`. It references the latest unresolved upload, otherwise the most recently decided upload. Admin rejection of the last unresolved upload returns the attempt to awaiting_upload, with receipt null and rejected recovery visible. Acceptance finalizes submitted with a receipt. Preserve every upload and decision; do not remove previously rejected evidence.

Admin accept/reject requires a nonempty reason, same-school admin authority and completed MFA. Accept scores the selected immutable snapshot with the approved key. Reject a competing acceptance if a different submission already finalized the attempt. Unique submission/receipt constraints and row locks must make competing accept/submit/transfer outcomes deterministic. Acceptance settles other unresolved uploads for that attempt as rejected with an audited superseded-by-accepted-recovery reason, so publication gates cannot remain accidentally unresolved. Replaying the same decision key is safe; changing its decision/reason with that key conflicts.

## 9. Admin MFA prerequisite for this integration

Use the protected operator provisioning path from the master plan; a browser MFA enrollment portal is not required for this increment. Provision school/first administrator and enroll TOTP through protected operator commands. Require a valid TOTP before activation; do not ship an admin bypass or fixed production verification code.

Use TOTP as defined in [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238), with these project settings: six digits, 30-second steps, HMAC-SHA1, a random 20-byte secret, current step with at most one adjacent step in either direction, and transactional rejection of a previously consumed successful step. Protect secrets at rest with a server-only key, exclude them from logs, and show enrollment material only through the private operator enrollment session. Rate-limit verification and expire the MFA challenge after five minutes.

Lost-authenticator recovery is operator-assisted for this MVP: authorized staff verify the administrator through the school's established support contact, revoke existing auth/MFA sessions, enroll a fresh secret and verify it before reactivation. Audit operator, administrator and reason. Document the exact protected commands and private delivery procedure; do not send live enrollment secrets in the implementation report. The login/MFA JSON contract is unchanged. Public browser enrollment/recovery endpoints are outside BE-02.

## 10. Required test data and acceptance evidence

Seed only synthetic users: two schools, students in different classes, a teacher and MFA-enrolled admin per school. Provide a ten-question paper totaling 20 integer marks, with both single-answer MCQ and true/false, frozen private keys, topics and explanations, and answer-free student packages. Provide separate scheduled, preparing, open, ended, submitted and recovery cases. Seed schedules relative to server time while retaining the real ten-minute preparation rule. Use an injected test clock for boundary tests; never expose a production time-override endpoint.

| Test | Required observable result |
| --- | --- |
| Auth | Cookie login/CSRF/MFA/logout work against the frontend origin; failed MFA grants no admin access |
| Isolation | Other school, other student and wrong role cannot list/read/unlock/write/download another attempt |
| List/detail | Empty list works; cursor order stable; direct detail never creates attempts |
| Enrollment | Reused visible device ID without credential cannot take over; different enrolled browser needs transfer |
| Preparation | Ten-minute boundary exact; downloaded ciphertext contains no usable key; official plaintext has no grading fields |
| Unlock | Just before start denied; at start allowed; at deadline denied; accommodations and late join use persisted deadline |
| Revisions | Replays acknowledge; changed reused revision conflicts; reordered batches never roll answers back |
| Atomicity | Final answers, score and receipt commit together; forced rollback leaves none partially committed |
| Timing | Complete body at finalAcceptUntil accepted; one millisecond later requires recovery; delayed commit does not change receipt-time decision |
| Lost response | Same key/body after deadline/process restart returns the same receipt; different payload/key reuse conflicts |
| Digest | Published canonical JSON and hash fixture match exactly, including null unanswered item |
| Races | Concurrent save/submit/transfer/recovery acceptance yields one valid final result; no later save overwrites it |
| Recovery | Late evidence is preserved separately; accept/reject audited; no fake receipt or unreleased score |
| Transfer | Generation increments once; old writes denied; server-only answers carry forward; deadline unchanged |

Also demonstrate a real browser disconnect/reconnect journey with database reconciliation once the frontend runner is ready. Report backend-only tests honestly until then. A successful seeded sitting is not proof of 500-student capacity, teacher imports or real AI; those master-plan release checks remain required later.

## 11. Required delivery and report

Provide staging API base URL, exact allowed frontend origin, implementation commit/version, applied migrations, seed/run commands and automated test output. Supply synthetic account credentials/enrollment instructions privately; no real secrets in Git or this report. Include the encryption and digest fixture results and database evidence of one exact final snapshot/receipt.

Report in this format after each increment:

```text
Task: BE-02A / BE-02B / BE-02C
Contract: v0.3 + backend-student-exam-task.md
Implemented endpoints:
Not yet implemented:
Commit/build identifier and migrations:
Staging URL and allowed frontend origin:
Seed/fixture instructions:
Tests: command, pass/fail, relevant evidence
Integration tested with frontend: yes/no; exact scope
Blockers/gaps: affected requirement, concrete evidence, impact
Unaffected work continuing:
```

Do not send a list of contract options to approve. Do not silently substitute mock endpoints or a different interface. Report a technical blocker with evidence; continue unaffected work while the project owner issues the needed instruction.
