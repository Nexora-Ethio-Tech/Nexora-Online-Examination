# Browser controls testing guide

Scope: browser deterrence and interruption reporting, plus explicit administrator suspension. This is not screenshot prevention, a secure browser, automatic tab-switch punishment, or deployment approval.

## Student rehearsal

1. Run `npm run dev:demo`, sign in with the existing demo student and open the current-window exam. Download the paper to start.
2. Confirm only the exam workspace is shown and every question carries a student ID, exam title and attempt watermark. No answer keys or credentials appear.
3. Choose Enter fullscreen. If unsupported or denied, a message appears and the exam remains usable. Escape is allowed; it can produce a fullscreen-exit report.
4. Answer a question, switch tabs and return. The answer and timer remain intact. This records an interruption without deducting marks or automatically suspending the student.
5. Go offline after unlocking. Answer changes remain on the device. Return online and leave the exam open for at least 15 seconds; optional interruption reports retry separately from answers.
6. Test normal submission and a lost-response retry. Only a matching receipt displays successful submission. Optional telemetry must never change the final digest.

## Administrator rehearsal

1. Sign in as demo administrator; open Live exams and Load synthetic monitoring example.
2. In Browser supervision, enter a reason and click Suspend exam attempt. Confirm the suspended status and decision history.
3. Enter another reason and choose Approve resuming exam. Confirm Not suspended and the second history entry.
4. Demo state is in-memory per app instance. This synthetic example does not demonstrate cross-browser enforcement. Do not treat separate student/admin demo tabs as a shared real backend.

## Real API acceptance required before deployment

Use the migration and endpoints in backend-browser-controls-task.md with two authenticated browsers against a disposable database.

- Suspend an active student from the admin monitor. Within a successful 15-second poll (or visibility return/online event), the student's paper is hidden and editing pauses. Unsynced answers remain stored.
- A suspended student cannot bypass the server by directly calling package, unlock, answers or new submit. All return ATTEMPT_SUSPENDED. Verify unauthorized roles, cross-tenant attempts, invalid CSRF and unverified admin MFA are rejected.
- Resume requires an explicit admin decision. The student chooses Revalidate and reopen; saved answers return and the deadline is unchanged. Reloading while still suspended must not unlock the paper.
- Race suspend against saves, submit and resume: row locking must serialize them. Existing committed receipts remain retrievable/replayable. Finalized attempts cannot resume, and recovery review remains available.
- Suspend while the student is offline: acknowledge that the offline browser cannot receive a new server decision until reconnecting. Upon reconnect, enforce the server flag; retain any unsynced work for review. Never imply instantaneous remote control.
- Test the deadline passing while suspended. Freeze local work, keep submission pending if rejected, and use school recovery review after the submission window. Never extend the clock or erase evidence.
- Check duplicate reports, reused event IDs, stale administrator revisions and lost response retries. A duplicate must not create a second audit decision.

Browser observations and client timestamps are untrusted, best-effort telemetry. Closing a process may prevent its last event from being recorded. Browser storage can be cleared, extensions can interfere, screenshots and external cameras remain possible. No automatic grading or attendance conclusions follow from missing/present events.

## Verification evidence

Verified locally on 16 October 2026:

- npm run check: TypeScript, lint, formatting, 192 frontend tests and 9 release-source tests passed.
- npm run build: production frontend build passed.
- Backend npm run build and npx vitest run test/unit: build and 52 unit tests passed. Supervision tests use a database double, not PostgreSQL.
- Chrome Playwright: all 26 browser/accessibility journeys passed. After the final runner race/error-handling changes, the 7 affected student/admin/production-retry journeys passed again.

PostgreSQL migration, transaction races, two-browser real API behavior and protected-Vercel service-worker behavior require integration acceptance; local unit/demo tests do not establish them.
