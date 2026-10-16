# Official exam engine

Requirements from master plan v3.0 sections 5, 8-12; api-contract.md v0.3 contains mandatory wire requirements. Report gaps or technical blockers to the project owner for a binding clarification; do not choose different behavior.

The BE-02 addendum in backend-student-exam-task.md defines direct student schedule reads, device enrollment/transfer, final digest and recovery reconciliation. Apply it together with this document.

## Time and states

startsAt = preparationVisibleAt + ten minutes. deadlineAt = common endsAt + approved extra time. finalAcceptUntil = deadlineAt + five seconds. Server computes these; late joining never resets time. Store UTC; display schedule in EAT.

UI states: scheduled, preparing, ready, unlocking, active, submitting, pending_upload, submitted, recovery_pending. Loading/error/revalidation views do not imply an official result.

- Scheduled: schedule only.
- Preparing: create/recover attempt, download ciphertext and versioned shell, verify hash, test local storage.
- Ready: preparation checks passed, wait for common start.
- Unlocking: authorized online request, validate package and stored orders.
- Active: network-independent navigation/answers; server offset plus monotonic elapsed time, recomputed after throttling. Device clock changes never extend time.
- Submitting: disable edits, freeze all answers including null/unsent items; persist exact final payload/key before sending.
- Pending upload: retain payload through timeout/401/deadline; retry identically and reconcile before recovery.
- Submitted: committed receipt matches the final snapshot; editing disabled.
- Recovery pending: late/disputed immutable evidence awaiting staff decision, never labeled Submitted.

## Local durability and reconciliation

Partition IndexedDB by school/user/attempt/version/generation. Every answer and outbox edit commits in one transaction before device-save success. Show last server save separately. Storage failure must show an explicit error, never claim durability; preserve available in-memory evidence.

Increment sequence per edit. Batch latest revisions about every 30 seconds with initial jitter, backoff and Retry now. Clear only acknowledged revisions; old responses cannot erase new edits. Persist one complete final snapshot at deadline/manual submit even with a save in flight.

One writable tab, using a tested browser coordination lock and fallback; second tab read-only. Server device binding remains authoritative. Reload restores local evidence first and requires online session/time/state/generation validation before editing. Offline reload shows recovery, not an editable exam. Reacquire decryption key through authorized unlock before deadline; never put raw keys in localStorage/sessionStorage.

401 must not delete outbox/final snapshot. Other users cannot access retained evidence. Never force service-worker replacement or delete active assets during pending work. Cleanup requires confirmed resolution and agreed retention.

## Acceptance cases

1. No plaintext/key before start; wrong school/student/device denied.
2. Unlock, disconnect, answer, reconnect, submit: exact full answers persisted and one receipt.
3. Lost response then same retry after deadline returns same receipt; different payload/key reuse conflicts.
4. Racing saves cannot modify final snapshot; save/submit/transfer has one audited outcome.
5. Deadline freezes edits. Late uploads become recovery, never fabricated submission.
6. Reload/session expiry preserve local work. Offline reload cannot resume editing. Transfer invalidates old ordinary writes.
7. Multiple tabs, reordered acknowledgements, storage failures, throttling and clock changes cause no silent loss or extra time.
8. 360px student flows and actual Android/network checks pass.

Mocks cannot satisfy integration acceptance; no E2E or capacity result is claimed here.
