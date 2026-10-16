# BE-11: Verified preparation reporting

Issued 15 October 2026, API contract v0.12. Mandatory project-owner interfaces implementing the master-plan readiness requirement (audit F-06). The exact wire format below is an implementation decision, not a quotation from the master plan. Implement it alongside BE-02 and BE-09; no backend approval of interface options is requested.

## Student acknowledgement

Implement `POST /api/v1/attempts/:attemptId/readiness` with the usual authenticated cookie, active student/school ownership, Origin/CSRF and current device binding checks. No administrator or teacher can report on behalf of a student. Use private/no-store responses.

Exact schemas are `src/features/exams/readiness.ts`; the call is in `src/features/exams/api.ts`. Body: `{packageId,sha256,examVersion,scheduleRevision,deviceGeneration,shellBuild}`. UUID Idempotency-Key is required. All versions/generation are positive integers; sha256 is the lowercase 64-character ciphertext checksum; shellBuild is a nonempty build identifier of at most 200 characters. Strictly reject extra fields. Return `{attemptId,readiness,serverNow}`; readiness echoes the body plus server-issued `acknowledgementId` and UTC `receivedAt`.

The browser sends this only after successful eligibility/device checks, package identity/checksum verification, completed IndexedDB write and verified production offline shell. Development mode skips reporting because its shell is not verified. The server cannot independently prove a browser's storage health: this is a last-reported client check, never proof of current connectivity, anti-cheating compliance or ongoing local durability. Do not accept arbitrary client timestamps as receivedAt.

Require an issued package whose ID/checksum/version matches this attempt and the current schedule/device generation. A new report is accepted only while the attempt is preparing and server time is before its personal deadline. Preparation can finish after common start for a late join; never reset or extend the deadline. This reporting endpoint is not a prerequisite for unlock, answers, submission or recovery: an unavailable reporting service must not disqualify the student. Existing eligibility, timing and device checks still apply.

Atomically serialize acknowledgement with device transfer, version changes, unlock and finalization. Persist the report and immutable replay response together. Identical same-key/payload retry returns the original result, including after the attempt becomes active or passes its deadline, without another acknowledgement or timestamp refresh. Authenticate and check current device/generation/package identity before replay: an old-device report must never revive readiness after transfer. A mismatched payload/key returns 409 IDEMPOTENCY_CONFLICT. A different valid key represents a newly completed check and may replace the current report while retaining audit history. Retain replay records according to existing mutation retention requirements, across restarts/processes.

Use the common error envelope: 401 auth/session; 403 wrong role/CSRF; 404 inaccessible attempt; 422 VALIDATION_ERROR for malformed input/key; 409 DEVICE_REPLACED for wrong current browser; 409 READINESS_MISMATCH for changed package/version/generation; 409 STATE_CHANGED for a new report outside preparing or at/after deadline; 409 IDEMPOTENCY_CONFLICT for changed payload on a used key. Do not delete student evidence after any failure.

## Monitor extension and invalidation

Update all BE-09 list/detail/attempt reads to the strict revised schemas in `src/features/exams/monitor/schemas.ts`:

- Each sitting now has required `readyCount`, a subset of `counts.preparing`, never an extra mutually exclusive status. Existing six status counts still sum to rosterCount. Compute readyCount across the entire frozen roster, not the current page.
- Each non-null student attempt now has required `readiness`, null or the above report. Null means no current matching report, not necessarily a failed preparation. Current reports may be retained for active/completed attempts as historical operational metadata, but only still-preparing, before-deadline students contribute to readyCount.
- Device transfer clears current readiness atomically. Package, exam-version or schedule-revision changes invalidate mismatched reports. Retain the old report in audit history, but never surface it as current readiness. A replacement browser must complete its own checks and send its new-generation acknowledgement.
- Reads do not create readiness, update receivedAt, update last contact, submit or modify answers. A successful new student acknowledgement may update last contact; a replay does not refresh it. No answer values, keys, ciphertext or credentials are added to monitor responses.

The UI labels the count **Ready (last reported)**, displays the server receivedAt in EAT and explains that it is a subset of preparing and does not prove continuing connectivity/storage. Do not relabel every preparing student ready or infer readiness from package download alone.

## Delivery and acceptance report

Return implementation revision/migrations, endpoint status, staging URL/allowed origin and private synthetic account provisioning instructions. Provide real database test evidence for: no report after checksum/write/shell failure; development-mode absence; correct identity and durable report; wrong role/school/device denial; checksum/version/generation mismatch; lost response and identical retry across restart; changed-payload conflict; concurrent report/transfer and report/unlock; exact deadline and accommodated late join; no timestamp changes on reads/replay; multi-student counts/pagination; transfer invalidation and replacement report. Record expected/actual status, timestamps, acknowledgement ID and revisions without credentials. Simulator tests do not prove backend persistence, races or isolation.

## Message to send

Implement BE-11 under API contract v0.12 using the included readiness and monitor schemas/API calls. Add the student acknowledgement and administrator readyCount/readiness fields, with durable replay and atomic device/version invalidation. Keep readiness as last-reported preparation evidence, never an online-status claim or an exam-access gate. Return the mandatory implementation and real-database test report above. Report concrete blockers to us rather than changing the interface independently.
