# Supplied security shield: architecture and testing

## Integration — 23 October 2026

The supplied shield is activated in the official exam runner. Practice and ordinary portal pages do not mount it. All original exports are preserved. watermark-geometry.ts is copied byte-for-byte (SHA256 7848B81DB59F2695BCA54BFBC4D73642FE9B6F7513359AF9A93013A0A562896A).

## Architecture

RunnerPage mounts ExamSecurityShield once while the engine is active. Start exam calls enterFullscreen directly from the click handler; questions are not mounted until it succeeds. Unsupported/denied fullscreen leaves a visible error and no questions. The existing server-controlled deadline already runs; the button never grants extra time.

The adapter calls useAntiScreenshot with strict true, requireFullscreen true and maxIncidents 5. Defaults and triggers are unchanged. Resume has the supplied 1500 ms cooldown and restores fullscreen where needed. Blackout makes question controls hidden and inert without destroying their state. The fifth blackout episode locks editing in this mounted browser UI. The engine continues saving, syncing and finalizing at the deadline. There is no automatic server suspension or disqualification. Reload/unmount resets the in-memory limit: this is deliberately not durable penalty enforcement.

The supplied overlay is portaled directly to body. Globally imported security-shield.css hides other page content and paints a black layer synchronously when the class is set. The overlay contains a visible explanatory card, so screenshots of the overlay are not literally all-black pixels. Print protection is scoped to a mounted protected runner. The old ExamPrivacyShield is no longer mounted in the runner.

ExamWatermark renders once, outside the hidden question container, using school name, student login ID, attempt suffix, exam title and EAT time. Its two SVG patterns move every 15 seconds. The tamper detector reports through the existing endpoint and restores a removed original watermark node when its original parent remains connected. It ignores intentional blackout hiding. It does not promise to repair arbitrary SVG content or hostile script modifications.

All hook interruption callbacks and watermark_tamper callbacks use RunnerEngine.reportSecurityEvent. Existing IndexedDB queuing supplies stable IDs, time and device generation, with offline replay to the authenticated interruptions endpoint. Neither localStorage nor sessionStorage holds security state. Legacy blur/fullscreen reporting is disabled only for the shield-managed engine to avoid duplicates; visibility/pagehide evidence remains. Server validation accepts screenshot_attempt, window_blur, fullscreen_exit and watermark_tamper. DevTools shortcut reports retain screenshot_attempt as requested. Reasons distinguish their trigger; none prove capture or misconduct.

The administrator attempt monitor maps received events and student/exam metadata into SecurityIncidentsPanel. It groups and filters the latest 100 received records, including delayed delivery. Existing detailed reasons and manual administrator decisions remain available. Confirm/dismiss controls are not mounted because there is no persistent incident-review endpoint. Recommendations are display-only, based on currently filtered reports, and are not the actual attempt state.

## Adaptations and limits

- Added ExamSecurityShield as the integration adapter and moved the watermark out of ExamQuestionSurface to prevent duplicates. Supplied files with no existing counterparts were added beside the runner files.
- Corrected overlay wording: a clipboard write is requested, not guaranteed successful; detected events are queued, not necessarily already received. The UI lock is not represented as a server lock.
- Admin display recommendations say proctor review rather than asserting a penalty or lock occurred. The supplied thresholds and weights remain unchanged. No server penalties were added.
- Panel dates use the existing Ethiopian-date/EAT formatter. Search has an accessible name. The overlay scrolls on short screens.
- OS-reserved keys may never reach JavaScript. A screenshot tool can capture before any browser event. Clipboard writes depend on permission and browser policy. Fullscreen, shortcut blocking and getDisplayMedia interception do not control other apps or cameras.
- Browsers without the required fullscreen API cannot start this strict exam flow. Verify school device compatibility before deployment.

## Test order

Use disposable/local test accounts. Do not use a real timed sitting for destructive browser tests.

1. Open a prepared official exam. Before Start exam, questions must be absent. Deny fullscreen and confirm the error; allow it and verify a single watermark, editable answers and unchanged deadline.
2. Answer a question. Switch tabs, leave the window, move the pointer outside on desktop, and separately press Windows, Alt, Win+Shift+S, PrintScreen and F12. Confirm hidden questions and black background. Keep separate notes for whether an OS screenshot was actually prevented. A black browser view alone does not prove it.
3. Check Resume is unavailable for roughly 1.5 seconds. Return focus/release modifier keys; resume and verify the saved answer. Exit fullscreen and verify resume restores it.
4. With a disposable clipboard sample, inspect PrintScreen clipboard behavior with permission granted and denied. Do not assume the wipe succeeded from the message.
5. After the watermark has been visible for at least a second, remove its entire DOM node using DevTools. Confirm it returns and the monitor receives watermark_tamper. Intentional blackout must not generate a hidden-watermark false report.
6. Repeat five separate blackout/resume episodes. On the fifth, Resume must disappear and questions remain inert. Saved work and the original timer must continue. This UI lock is not a persisted server penalty.
7. Disconnect networking, answer, trigger a report, reconnect and inspect the received report. Submit and verify a committed receipt. A lost submission response must retain exactly the same final snapshot across reload.
8. As a school admin, open Live exams → a sitting → student device/history. Test incident category, search and delayed-delivery filters; expand the attempt. Check full reasons, EAT dates and manual suspension/resumption remain available.

## Verification record

- Frontend full check passed: typecheck, lint, formatting, 253 component/unit tests and 14 tooling checks. A subsequently added engine deduplication regression passed with all 33 runner tests (254 frontend tests now covered). Final typecheck/lint/format also passed.
- Frontend production build and backend build passed. The frontend retains its existing large-chunk and dependency annotation warnings.
- Backend: all 180 unit tests passed, including event allowlist/replay/no automatic suspension checks.
- Chromium: 41 distinct browser cases passed across the full run and targeted reruns, covering desktop, 360px and landscape, production submission recovery, accessibility, watermark restoration, strict limit, fullscreen start/resume and pointer blackout. The initial full run passed 37/38; the remaining auth test needed to dismiss the updated onboarding guide and then passed. Three additional fullscreen-resume cases passed.
- Microsoft Edge on Windows, automated/headless: three focused cases passed (strict shield/tamper/limit, fullscreen exit/resume/pointer/answer retention, production role guard). The new answer test was adjusted to wait for the existing asynchronous save before checking the radio state.
- Geometry SHA256 matches the supplied original exactly. Git diff whitespace check passed.
- Blocked: local database integration (20 cases skipped after setup failed). Connection to 127.0.0.1:55432 was refused. Windows Application Control blocks the bundled pg_ctl.exe even outside the filesystem sandbox. No live DB acceptance or new migration validation is claimed.
- Not verified: physical Windows/Alt/Win+Shift+S/PrintScreen interception, actual OS screenshots or clipboard contents, physical tab/window switching, real mobile devices, or real-server delivery for this integration. Browser-dispatched events, Fullscreen API transitions, and a mocked rejected clipboard write are separate evidence. No production deployment, push or hosted database changes occurred.

## Files changed in this completion

Paths are relative to exam-frontend.

- Runner integration: src/features/runner/ExamSecurityShield.tsx (new), RunnerPage.tsx, engine.ts, ExamQuestionSurface.tsx.
- Supplied components: src/features/runner/watermark-geometry.ts (new, unchanged original), ExamWatermark.tsx, AntiScreenshotOverlay.tsx, SecurityIncidentsPanel.tsx (new).
- Admin mapping: src/features/exams/monitor/SupervisionPanel.tsx and MonitorPages.tsx.
- Guidance: src/features/onboarding/guide.ts, docs/backend-handoff.md and this guide.
- Tests: src/features/runner/ExamSecurityShield.test.tsx and SecurityIncidentsPanel.test.tsx (new), ExamWatermark.test.tsx, useAntiScreenshot.test.tsx, runner.test.ts; src/features/exams/monitor/MonitorPages.test.tsx; tests/e2e/demo.spec.ts and production.spec.ts.

The supplied hooks, global stylesheet/import, audit helpers and backend validation were already committed in the preparation stage and remain in place. The pre-existing deletion of nexora-backend/.env.example is unrelated and excluded from these commits.
