# Exam copying deterrents and supervision clarity

Implemented locally on 21 October 2026. This extends the existing Exam Privacy Shield. It does not promise complete cheating prevention or screenshot blocking. No clipboard wiping, DevTools blocking or automatic tamper penalties are added.

## Architecture and changes

1. `ExamWatermark.tsx` retains one readable attempt reference and device timestamp (Ethiopian calendar, AM/PM EAT). A decorative SVG pattern repeats these across the entire question panel, including long panels. It contains no student name, login ID, workstation IP or answer key. The label is a deterrent, not authenticated capture evidence. No movement or anti-removal guarantee is claimed.
2. `ExamQuestionSurface.tsx` scopes the watermark and drag deterrent to the active question. `privacy-shield.css` disables selection only on question stems and option text. Inputs and editable descendants retain selection. Radio buttons, keyboard navigation, context menus and browser shortcuts remain usable. An advanced user can bypass client styling.
3. Tiles cannot intercept pointer events and are excluded from the accessibility tree. Forced-colors mode hides the decorative tiles but keeps the readable reference. Normal text remains at its existing contrast. Physical-device readability still needs acceptance.
4. `RunnerPage.tsx` mounts this surface inside the existing privacy shield. Concealment, deliberate Resume, scoped print notice, saved-answer persistence and server deadlines retain their existing behavior. Practice and authorized report pages do not get selection restrictions.
5. `InterruptionRecord.tsx` names observations in plain language. Device-reported and server-received timestamps are shown separately in EAT. Neither a time difference nor a focus event is classified as cheating.
6. `SupervisionPanel.tsx` displays the last successful refresh, explains visible-page 15-second polling and delayed/offline reports, and warns when retained information may be stale. Staff decisions remain explicit and revision-protected. Decision history timestamps now use the same Ethiopian/EAT formatter.
7. Existing durable telemetry is retained: up to 200 locally queued events, batches of 50, server acceptance acknowledgments and stable IDs for retries. Extra events beyond the local bound are not retained; abrupt process termination or cleared browser storage may lose observations. Missing reports never prove uninterrupted attendance. Tests cover lost responses, duplicate IDs and partial acknowledgments without answer/deadline changes. The lost-response test exposed and fixed a development-demo replay defect: the demo had parsed the stored event including receivedAt against a strict client-event schema. It now compares only the original event fields. Backend runtime behavior was already correct.

## Backend boundary review

Reviewed the current source, not the other agent's implementation:

- `authoring/package-worker.service.ts` selects item ID, type, stem, options and marks; a strict schema rejects extra private fields before encryption. Expanded tests inject several answer-key spellings and explanations, verifying no package is inserted.
- `delivery/preparation.service.ts` scopes owned attempts by school, student and admitted roster membership. Unlock validates device binding, generation, package/version/revision, editable state, start time and deadline before returning a decryption key.
- `delivery/delivery.service.ts` checks attempt ownership and suspension for answer uploads and submission. Existing unit coverage verifies suspended operations are rejected.
- `delivery/supervision.service.ts` scopes reads/writes by tenant and owner, rejects teacher access, deduplicates event IDs, separates server receipt from client observation and requires explicit administrator decisions. Expanded tests confirm events do not suspend students and invented screenshot event types are rejected.

No backend runtime or API contract changes were needed for this slice. These source checks and mocked unit tests are not a complete penetration test or proof of PostgreSQL isolation. No live database or deployment was changed. Migration 024 still requires isolated-database validation before deployment.

## Automated checks

Run from `exam-frontend`:

```powershell
npm run check
npm run e2e
```

Run from `exam-frontend/nexora-backend`:

```powershell
npm run test:unit
npm run build
```

Verified locally: frontend check passed (TypeScript, ESLint, formatting, 229 frontend tests and 9 release-source tests); backend 161 unit tests and build passed; frontend production build and all 35 browser journeys passed. Desktop and 360px mobile screenshots were visually inspected. Existing build warnings about bundle size and third-party annotations remain. Browser journeys cover offline answers, shield return, scoped printing, watermark coverage, selection rules, forced colors, click-through behavior, submission and accessibility on desktop/mobile/landscape. They do not automate OS screenshot tools or prove actual capture prevention.

## Manual acceptance

1. Open an active exam at 360px, desktop width and 200% zoom. Inspect long questions in light and dark themes. Tiles should cover the panel without obscuring answers; the attempt reference must contain no name, login ID or IP.
2. Click every option and navigate by keyboard. Attempt selecting/dragging stems and option text. Verify answer controls, ordinary portal text and authorized reports remain usable. Check forced-colors mode and a screen reader: repeated tiles must not be announced.
3. Save an answer, leave the window and return. Questions remain concealed until Resume. The answer survives and the original deadline continues. Repeat offline, reconnect, upload and verify the committed submission.
4. Print from the exam: only the protection notice should appear. Print authorized results: the report must still work. Try actual Snipping Tool, PrintScreen and recording; record separately whether concealment occurred and whether captured questions were visible. Never call a visible capture a successful prevention test.
5. On a staff monitor, create a focus interruption. Check the device-reported and school-received times. Disconnect the student before another event; reconnect and verify eventual receipt without duplicate events. Reports are best effort, not instantaneous alarms.
6. Fail a staff refresh. Previously loaded information must show a stale warning; a failed refresh must not imply there were no events. Test suspend/resume through approved staff flow; no event should automatically change grades, deadlines or authorization.
7. In an isolated database, verify another student/tenant cannot read the attempt, obtain its key or submit answers; verify pre-start unlock, wrong device, expired deadline, invalid CSRF and unverified admin MFA are rejected. These real integration checks remain separate from synthetic local tests.
