# Exam Privacy Shield testing

## Automated coverage

Component tests exercise blur concealment, deliberate resume, retained input state, focus restoration, hidden/unfocused refusal, beforeprint and handler cleanup. Watermark coverage checks repeated references and UTC formatting. The runner integrity test checks durable focus-loss recording without changing saved answers, deadline or active authorization. Existing runner tests cover finalization, recovery and staff assistance independently.

Verified locally on 21 October 2026:

- Frontend check: typecheck, lint, formatting, 210 tests and 9 release-source checks passed.
- Backend: 144 unit tests and compilation passed.
- Frontend production build passed, with existing chunk-size and dependency annotation warnings.
- Targeted Playwright desktop and 360px mobile journeys both passed: offline answer persistence, simulated blur/focus, explicit resume, print-media hiding, navigation and confirmed submission. These use synthetic data and a demo backend.

Simulated DOM events and print-media emulation do not prove actual screenshot prevention or physical print-dialog behavior.

## Required real browser acceptance

Use a synthetic exam with no real student data. Record browser/OS versions and actual observations separately for each case:

1. Chrome and Edge: switch tabs, Alt-Tab, minimize, return; content stays hidden until Resume. Test 360px width and keyboard/screen-reader navigation.
2. Answer, blur while saving, disconnect, return, resume and reconnect. Confirm exact saved answers and pending uploads; no timer reset. Let the deadline expire behind the shield and verify final snapshot/receipt or pending recovery.
3. While hidden, staff suspend or approve assistance. Resume must not override the server state. Reopening after a blocked state still requires existing revalidation.
4. Try PrintScreen, Win+Shift+S, Snipping Tool, browser screenshot tools and recording. Record both whether the shield appeared and what the capture contains. A captured question is a documented browser limitation, not a passing screenshot-prevention result.
5. Print using the menu and Ctrl+P: preview/PDF contains a notice and no exam questions. Cancel printing: Resume is required. Navigate to an authorized report and verify ordinary report printing.
6. Permission prompts, fullscreen entry/exit, browser chrome clicks and assistive technology: verify recoverability and no automatic punishment for legitimate focus changes.
7. Verify supervision accepts `focus_lost` on the real backend and preserves tenant isolation. Check offline queued events, retry and rate/count limits without losing answers.

No OS capture, physical-device, live-database or hosted acceptance is claimed by unit tests. No deployment or migration is performed for this task.
