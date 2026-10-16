# Student schedules and encrypted-paper preparation

Update: the runner increment now adds timed unlock, questions, durable answers, final submission and production offline-shell verification. See [student-runner.md](student-runner.md). The historical scope below describes the earlier preparation-only increment.

Implemented 13 October 2026 against contract v0.3 and BE-02. This is a frontend increment, not a completed exam engine or backend acceptance.

## Test the increment

Run `npm run dev:demo`, sign in as DEMO-STUDENT with NexoraDemo!, and open My exams. Six synthetic cases show a recorded submission, pending school review, an ended window, a current window, preparation and tomorrow's schedule. Times are explicitly EAT. Mathematics starts five minutes after demo launch; the full preparation window remains ten minutes. Reload resets the simulated server/login, while encrypted IndexedDB records remain.

Open Mathematics, then select Download encrypted paper. The screen revalidates the schedule, enrolls this browser, creates or recovers an attempt, reads its current state, downloads ciphertext, checks SHA-256 and saves it in IndexedDB. Success says Encrypted paper saved. No key is requested or persisted. Returning to a page requires online revalidation and explicit verification again; a previous local record alone never grants readiness.

Loading, empty lists, cursor pagination, errors/retry, scheduled/ended restrictions, device-replacement guidance and terminal attempt states are supported. A state label does not prove a matching submission receipt. Teacher and administrator workspaces remain their earlier shells.

## Persistence and requests

- Device UUID and attempt-creation UUID are retained transactionally before requests. Creation retries reuse the same Idempotency-Key; mutations are not retried automatically.
- Package records are partitioned by school, student, sitting, attempt, exam version, schedule revision and device generation. Logout does not delete them.
- Failed checksums, mismatching versions and failed writes prevent success. The package schema rejects extra fields, including accidentally returned keys.
- Leaving the page or changing identity cancels preparation. A cancelled request may already have committed; retained request identity enables safe recovery next time.
- Countdown uses server time plus monotonic elapsed time. It is informational; the backend authorizes timing boundaries.
- Simulated enrollment does not implement real device cookies or prove security. Real binding, tenant isolation and timing enforcement require backend acceptance.

## Remaining exam-engine work

Full Ready requires a versioned offline app shell as well as a verified durable package. That shell, timed unlock, questions, atomic answer/outbox saves, single-writer coordination, submission and recovery are the next increment. This build offers no Start exam button. No real backend, offline sitting, phone hardware or capacity acceptance is claimed.

Backend must continue BE-02A exactly as issued; see `backend-preparation-integration.md`. No new wire format is introduced. BE-02B and BE-02C remain mandatory.
