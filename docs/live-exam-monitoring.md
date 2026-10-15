# Live exam monitoring and device replacement — testing guide

This frontend increment follows the master plan's administrator exam view, 15-second monitor refresh, server-confirmed recovery and unchanged exam deadlines. Backend implementation is specified by [BE-09](backend-monitor-task.md), API contract v0.10. The demo is a local simulator, not proof of production backend security or device synchronization.

## Quick demo: registration → approval → restored answer → submission

Run `npm run dev:demo` in the repository and open the printed local URL. Use the same tab throughout; switch roles using **Sign out**, without browser reload. Reload resets the demo server, while IndexedDB evidence remains. Use public synthetic credentials only: DEMO-STUDENT / DEMO-ADMIN, password `NexoraDemo!`; administrator verification code `123456`.

1. Sign in as DEMO-STUDENT. Open **Register replacement browser** and click **Register this browser**. The page must show **Browser registered** and a UUID. Copy that displayed ID; registration alone does not transfer an exam or change a deadline.
2. Sign out, sign in as DEMO-ADMIN and complete verification. Open **Live exams**, then **Load synthetic monitoring example**. This creates an active attempt for Samira with one server-saved answer and a 60-minute window that started one minute ago. Its synthetic old browser is distinct from your registered browser. You do not need to wait for Mathematics or create a teacher paper for this rehearsal.
3. Note **Student deadline**, generation 1, **Active**, and one answered item in server saves. The approval button starts disabled. Enter the UUID from step 1, a reason such as “Damaged screen; student identity checked,” and check the confirmation box. The button becomes enabled. Invalid UUID, blank reason or missing confirmation keeps it disabled.
4. Click **Approve device replacement**. Expect **Replacement approved: generation 2**, unchanged deadline, **Preparing**, and one history entry with Hana, time and your reason. Admin approval is not student contact or an answer save; those two timestamps must stay unchanged. **Back to sitting monitor** shows the same status and counts.
5. Sign out and return as DEMO-STUDENT in the same tab. Under My exams, open **Device replacement · synthetic rehearsal**, then **Open saved attempt** (or download the encrypted paper). The runner must unlock online, show question 1's True answer already selected, one local answer, no pending upload and the original deadline. This inherited answer was received by the simulated server before transfer. Unreceived old-device answers are not automatically recovered.
6. Use **Review and submit → Confirm submission**. The student must see **Submitted** and a receipt. Return as admin to Live exams and open the rehearsal. Expect one submitted student and a committed submission time. Open Device and history: no further replacement is allowed for that submitted attempt.
7. Clicking **Load synthetic monitoring example** again opens the same example; it never restarts the timer or creates a second copy. A full page reload intentionally resets the synthetic server. This example exercises delivery and monitoring only; official results/publication require a teacher-approved, scheduled paper through the existing workflow.

## What each part of the monitor means

| Display                        | Meaning                                                                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server snapshot                | When the API produced this view. Refresh updates it even if no student changed state. Times explicitly use EAT, with seconds.                                                   |
| Not started                    | A frozen roster member has no attempt, including someone who missed the window.                                                                                                 |
| Preparing                      | An attempt exists, or was transferred and needs to unlock. It does not prove the encrypted paper is locally saved.                                                              |
| Active                         | Server-authorized in-progress attempt before its own deadline. It is not an online-presence indicator.                                                                          |
| Submitted                      | The server has an actual committed receipt. An expired timer or interim save alone is not submission.                                                                           |
| Recovery needed                | An unfinished attempt is overdue or awaiting upload/review. If there is no recovery ID, staff must first ask the student to retain and upload the old browser's final evidence. |
| Last student contact           | Last successful recorded student request on the attempt. A quiet connection is not proof of disconnection or misconduct. Admin refresh/approval does not update this.           |
| Last server answer save        | Last accepted answer batch. Different from device save, contact, transfer and final receipt times.                                                                              |
| Answered items in server saves | Non-null answers in accepted incremental saves, including inherited answers. Does not count unreceived local work or replace the final receipt.                                 |
| Latest student deadline        | Latest approved individual deadline across the frozen roster. A student with an existing accommodation can still be active after common end. Transfer cannot add time.          |

The roster and history use Previous/Next page controls. Counts cover the whole roster, not just the current page. Queries refresh every 15 seconds while visible, with 30–60 second retry intervals after errors. A snapshot older than 30 seconds, unavailable network, read error or hidden page pauses new transfer controls. Refresh restores them only when server data and deadline permit. A generation change clears the prior confirmation.

## Error and recovery checks

- Wrong/unregistered replacement ID: backend validation error; no new generation or audit. Register the intended browser while signed in as the correct student, then use its displayed ID. Do not invent one.
- Same currently active browser: conflict; no transfer. Registration is not intended to “refresh” or restart a healthy exam.
- Deadline reached: controls close; server also rejects transfer. Use recovery review for retained evidence. The final upload allowance does not permit replacement.
- A lost transfer response: the open form shows **The outcome is not confirmed** and **Retry same transfer**. Refresh history and retry the same request; expect one generation increment and one audit event. The form freezes edits to avoid changing an uncertain operation. If you left/reloaded the page, inspect current generation/history before proposing another replacement.
- Missing/expired browser credential: registration shows an explicit checkbox before **Create new browser registration**. It replaces only the non-secret browser ID and keeps saved answers/packages. A lost enrollment response retries the retained new ID. Do not clear all browser storage. This credential-cookie error needs the real backend; the local simulator does not create HttpOnly cookies.
- Pending old-device work: preserve it. Do not assume the server recovered answers it never received, and do not overwrite an unmatched final snapshot because another receipt exists. Review under the existing recovery workflow.

## Automated and real-backend verification

Automated coverage is in `src/features/exams/monitor/api.test.ts`, `MonitorPages.test.tsx`, `src/features/exams/DevicePage.test.tsx` and the existing runner tests. Run `npm run check` and `npm run build`. On machines where many simultaneous browser-test workers exhaust resources, `npm run test -- --maxWorkers=2` runs the same tests with bounded concurrency; it is not a substitute for fixing an assertion failure.

The tests cover role/MFA restrictions, scoped reads/pagination, truthful counts/contact, expired/nonexistent attempts, transfer replay/conflicts/competing operations, unchanged deadline/order, sequence-zero inheritance, old-device refusal, retained recovery evidence, lost-response retries, stale-screen controls, generation confirmation changes, registration without attempt creation, credential rotation and IndexedDB evidence preservation. Backend authorization, true device-cookie enforcement, multi-browser operation and database races must additionally pass BE-09 section 7.

The demo has one learner per sitting and stores data in one tab's memory. Separate tabs do not share its simulated backend. Two legacy completed/review student cards have no real attempt fixture and are omitted from this monitor. Full school rosters, two-school isolation, real offline phones, persistent restart/recovery and 500-student capacity are not established by these demo checks.
