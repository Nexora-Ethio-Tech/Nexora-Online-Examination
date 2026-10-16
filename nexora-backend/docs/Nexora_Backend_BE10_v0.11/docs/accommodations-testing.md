# Extra-time accommodation testing guide

Feature: administrator extra-time configuration before preparation. Frontend/demo implemented; real backend verification follows BE-10. Use `npm run dev:demo` in the repository. Keep one tab open: demo data is in memory and resets on reload. Sign out/in within the app to switch roles. Credentials remain DEMO-TEACHER / DEMO-ADMIN / DEMO-STUDENT, password NexoraDemo!, administrator MFA 123456 (demo only).

## Manual journey

1. Use the existing 20-question math guide to upload the unchanged downloadable demo file, complete teacher review, submit and approve it as administrator. Schedule preparation far enough in the future to finish these checks (at least 15 minutes); the ten-minute preparation period remains mandatory. Choose a results time at least 30 minutes after common end.
2. In the approved paper's scheduled sitting, select **Manage extra time**. Confirm common start/end, preparation lock time, latest deadline, planned results and the frozen roster. The demo supports Samira only; production must paginate the full roster.
3. Select **Edit extra time for Samira**. Enter 15 minutes, an approval reference/reason, then check the confirmation. Save is disabled without a reason/confirmation, for unchanged values, invalid whole-minute values, stale schedule or a passed preparation cutoff. The input ceiling is 480 minutes. Avoid medical details in reasons.
4. Save. Expect one last-change entry, 15 extra minutes and a deadline 15 minutes after common end. The common start/end must remain unchanged. Return to approval/schedule: expect latest student deadline and an accommodation_changed history entry.
5. Before preparation opens, reschedule to a later preparation time. The preview and results validation must include the same 15 extra minutes. Save and return: the allowance stays 15 and its deadline moves with common end. Set zero to remove, then restore 15 for the student check.
6. Try an allowance that would exceed planned results: expect actionable guidance to use Change schedule first. No silent results-time change or partial save. In two tabs on a real backend, a stale editor must be rejected or require selecting the student again after refresh.
7. At preparationVisibleAt, the editor locks. Neither adding nor removing minutes is allowed, including from an already-open editor. A fresh read occurs every 15 seconds while visible; the local server-derived clock also locks at the boundary. After 60 seconds without a successful fresh read, edits pause.
8. Switch to the student without reloading. The assigned sitting shows common end separately from **Your deadline**, now 15 minutes later. Prepare, unlock at common start and answer. A late join, reload with online revalidation or device replacement must keep that original personal deadline. Joining after common end but before the personal deadline must not reset the timer. Final acceptance grace stays five seconds after the personal deadline.
9. Check administrator monitor: Samira's deadline and the latest sitting deadline include the allowance. Results and practice remain blocked until the full extra-time submission window closes, even if Samira never creates an attempt or submits early. Publication and practice still require their separate approvals.

## Retry/error behavior

If saving reports an unknown outcome, keep the page open and use **Retry the same save**. Fields stay locked and the exact payload/Idempotency-Key is reused. An already-committed change can replay successfully even after preparation opens, without a second change/audit. After success, a fresh GET supplies current server time; the old replay timestamp is not used as a fresh clock. A definite validation/conflict rejection clears the editor; refresh and select the student again. If the browser was closed during an uncertain save, inspect the authoritative allowance/history before making a replacement change.

## Automated checks and limits

`npm run check` runs schema/type, lint, format and unit/component/API simulator checks. Accommodation tests cover extended deadlines, absent-student gates, late join, role denial, stale revision/cursor, results/overlap rejection, reschedule preservation, zero removal, boundary freeze and replay. Component tests cover EAT preview, confirmation, conflict guidance, a lost response with identical retry, and locking an open editor.

Browser verification and final check results are recorded in the feature delivery message. Simulator and intercepted-response browser tests do not establish real cookies, persistence, concurrency, multi-student behavior, Android support or backend acceptance. Send [backend-accommodations-task.md](backend-accommodations-task.md) and the v0.11 code/contracts to the backend developer; its delivery report is mandatory.

## Recorded verification — 15 October 2026

- `npm run check`: passed typecheck, ESLint, formatting and 175 tests across 33 files.
- `npm run build`: passed. Existing Zod annotation notices and the bundle-size warning remain; no new dependencies were introduced.
- Built-app Edge check with a synthetic API: passed at 360 × 800 and 1366 × 900, with a Pacific browser timezone. Verified EAT preview, confirmation gate, save/audit, refresh/freeze, no horizontal overflow and no page errors. The 360px screenshot was visually inspected.
- Real backend/database, multiple actual students/devices and Android acceptance remain outstanding. These results are not a claim of real backend completion.
