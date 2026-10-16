# Backend instruction: connect the student exam runner

Issued 13 October 2026. Read and implement this with API contract v0.3, BE-02 and the preparation integration note. This is a mandatory integration checklist, not an invitation to choose different interfaces. No wire-format revision is introduced here. The master plan remains authoritative.

## What to do with this file

1. Use the sequence below to connect BE-02A and BE-02B to the frontend runner now.
2. Complete BE-02C so the same retained final answers can enter school review when late or disputed. Do not return a successful submission for a recovery upload.
3. Run the required cases below against real PostgreSQL and the frontend origin. Return the evidence in the report format at the end.
4. Report a concrete technical blocker with evidence; continue unaffected requirements. The project owner issues any interface revision. Do not silently change endpoints, payloads or timing.

The frontend demo and automated mock tests do not establish backend completion, scoring correctness, isolation, capacity or production readiness.

## Runtime sequence and required behavior

All API paths use prefix `/api/v1`. All writes use cookie authentication, allowed Origin and X-CSRF-Token. Device generation is not a credential. Enforce membership, roster, tenant and the device rules already specified in BE-02.

### Reopen and timed unlock (BE-02A)

The runner reads GET /attempts/:id online, enrolls this browser with POST /auth/device, and recovers the attempt using POST /sessions/:sessionId/attempts with its retained UUID Idempotency-Key. Return the same attempt, generation, schedule and deadline. This recovery must support an already-active attempt without resetting time or answers.

The frontend reads the cached encrypted package for the exact school/student/attempt/version/generation, or GET /attempts/:id/package. POST /attempts/:id/unlock sends packageId, examVersion, scheduleRevision and deviceGeneration. Return the complete v0.3 unlock response, including stable orders. Reject before common start and at/after deadline. Do not change order on retry or reload. Do not send a key through any other endpoint.

The frontend verifies ciphertext hash, AES-GCM authentication, the strict answer-free plaintext allowlist, and exact question/option membership and order. Return only valid single-answer MCQ or true/false papers. True/false option IDs are true and false. Incorrect membership, versions, generation or deadline stop editing. Return confirmed answers and highestAcceptedSeq accurately for reload and transfer reconciliation.

### Answer saves (BE-02B)

Each edit commits locally with an increasing sequence and an outbox entry in one transaction. POST /attempts/:id/answers sends current pending revisions, usually around every 30 seconds with jitter; reconnect and manual upload can send sooner. Transient failures back off. The UI distinguishes device-save success from last confirmed server save.

Validate the entire batch atomically. Keep revision fingerprints to reject conflicting reuse. Return acknowledged only for those exact item/sequence pairs; superseded is not an acknowledgement that an old value was saved. A late response must not change final submission or newer answers. GET /attempts/:id must return the same confirmed values/revisions so the frontend can reconcile. A conflict stops editing and retains local evidence.

### Final submission and receipt (BE-02B)

At the server-defined deadline, or after the student confirms, the frontend freezes every item including null unanswered values, its finalSeq, versions/generation and one UUID key in local storage. It sends POST /attempts/:id/submit immediately. An in-flight interim save does not delay the final snapshot. The frontend does not wait for a receipt GET before its first POST, because that extra request could consume the five-second acceptance allowance.

Commit the final answers, score and unique receipt atomically under the same attempt lock used for saves/transfer/recovery. Capture receivedAt after the complete request body arrives, before waiting for the database lock. Apply startsAt <= receivedAt <= finalAcceptUntil and the prior-unlock requirement. The frontend computes the exact BE-02 canonical digest and displays Submitted only for a matching committed receipt. It never treats HTTP success, a save acknowledgement, a closed state or a recovery record as submission proof.

A timeout, disconnect or failed response retains the exact body and Idempotency-Key. Retry must replay an already-committed result even after the deadline or server restart. After an ambiguous failure, GET /attempts/:id/receipt must permit owner-authenticated receipt reads without requiring the old active device credential. Return attemptId/state/receipt/recovery, and include idempotencyKey/finalSeq inside receipt. A different snapshot receipt is a conflict, not permission to discard local evidence. Never release unreleased marks through these responses.

### Late evidence and device changes (BE-02C)

After normal submission is refused as late, the student can send the retained complete final fields plus a reason to POST /attempts/:id/recovery. The recovery UUID is separate and persisted; identical retries retain the same reason and body. Enforce the window and old-known-generation exceptions from BE-02. Before finalAcceptUntil has passed, return the required conflict/retry timing; do not interrupt a current device through premature recovery.

Return recovery_pending, never submitted. Implement admin decision and device transfer exactly as BE-02 specifies. A receipt from an accepted recovery uses the recovery upload key and original finalSeq/digest. Rejected recovery stays explicit. No automatic admin acceptance is simulated by this frontend. Owner-authenticated receipt reads must remain available after transfer/credential expiry; active operations must still reject the replaced device.

## Required evidence before acceptance

- Run a real seeded sitting: prepare, authorized unlock, MCQ/true-false answers, disconnect, local edits, reconnect, upload, complete final snapshot, one committed receipt. Compare database values with every final answer, including nulls.
- Verify exact common start/deadline/accommodation and five-second acceptance boundaries with an injected test clock. Demonstrate no deadline extension on reload or late join.
- Hold an answer-save response while final submission commits; release it afterward. Confirm it cannot overwrite the final result.
- Commit submission but drop its response; replay the same key/body after deadline and process restart. Return the same receipt, with exactly one database submission/score.
- Force a transaction rollback during final acceptance. No partial answers/score/receipt may be visible as submitted.
- Reorder save acknowledgements and reuse a sequence with a different value. Show monotonic values, exact acknowledgements and atomic conflict rejection.
- Expire authentication during submission and replace the device during an active sitting. Reauthentication preserves evidence; no old-device ordinary write succeeds; receipt reads and valid disputed recovery still work.
- Confirm late recovery stays pending until an audited admin decision. Test accepted/rejected decisions and competing submit/transfer/accept races.
- Verify wrong-school, wrong-student and wrong-role reads/writes/unlocks/receipts/recovery are denied without leaking data.
- Reproduce the issued encryption and canonical digest fixtures. Do not use their deterministic keys/nonces for real papers.

## Hosting requirements

The frontend build emits `/sw.js` and versioned app assets. Serve the app over HTTPS, serve sw.js as JavaScript with revalidation (Cache-Control: no-cache), and retain existing hashed assets during deployment. Frontend navigation routes need index.html fallback; `/api/v1` must always reach the API. No API/auth/package/receipt response belongs in a shared cache. The worker caches only explicit built assets, never API responses, and does not force activation or delete a prior build's cache during an exam. Do not add proxy caching of private API responses.

## Required report

Return: BE-02 increment(s), contract v0.3, backend commit/build, implemented and missing endpoints, migrations, real API prefix, exact allowed frontend origin, synthetic seed/run instructions, test commands/results, encryption/digest fixture output, and database evidence of final snapshot/receipt uniqueness. State which tests used the actual browser versus backend tests. Deliver synthetic credentials privately. Include concrete blockers and unaffected work continuing.

Real device/network, offline reload, deployment/rollback, isolation and 500-student load acceptance remain required before release. A local demo does not satisfy them.
