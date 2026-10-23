# Supplied security shield: integration preparation

## Status — 23 October 2026

**Not activated in the runner.** The supplied ExamWatermark.tsx imports `./watermark-geometry`, exporting `computeWatermarkOffset` and `formatWatermarkLabel`. This dependency is absent from the repository and the supplied folder. The user explicitly asked to preserve that module, so a replacement has not been invented. Supply the original file before completing runner integration. The existing ExamWatermark and ExamPrivacyShield remain in use.

SecurityIncidentsPanel.tsx was not included. Existing InterruptionRecord rendering has labels for the new event kinds; no replacement admin panel is claimed.

## Prepared changes

- Supplied useAntiScreenshot, AntiScreenshotOverlay, useWatermarkTamperDetector, security-shield.css and security-audit-report retain their exports and behavior, with formatting only. They are added beside the existing runner files because those five names had no existing counterparts in this checkout.
- CSS is globally imported. Its protection selectors remain inactive until runner integration adds the protected class and mounts the supplied hook.
- Frontend and backend accept screenshot_attempt, window_blur, fullscreen_exit and watermark_tamper, plus existing event kinds. Optional reason text is limited to 500 characters.
- RunnerEngine.reportSecurityEvent queues events through the existing IndexedDB record, with stable IDs, timestamp and device generation, then requests the existing authenticated reporting flow. Offline reports remain queued for the existing retry path. No localStorage or sessionStorage security state is introduced.
- Server reporting preserves ownership, tenant, replay and device-generation checks. It does not apply automatic penalties, suspension or deadline changes.

## Remaining integration

After receiving watermark-geometry.ts, replace ExamWatermark in place, render it once, replace the old privacy wrapper with the supplied overlay, and activate strict/fullscreen mode with a five-episode UI limit. Add an explicit Start exam user gesture: the present runner automatically opens/unlocks and does not have that button. Keep the timer and answer persistence running while the shield hides editing. Remove duplicate legacy reporting for events handled by the new hook. The limit is UI-only and must not be described as a durable server lock.

The supplied overlay says clipboard content has been wiped, but the hook intentionally ignores permission failures. That wording cannot establish a successful wipe. Likewise, browser-dispatched shortcut events do not prove OS capture was intercepted. Report these limitations when completing the integration; preserve the requested trigger behavior.

## Verification

Hook tests exercise synthetic Meta, Alt, PrintScreen and F12 events, synchronous blackout classes, the 1500 ms resume delay, pointer leave, five-episode limit, deduplication and cleanup. Backend supervision tests cover new kinds, replay and no automatic suspension. These are automated component/service tests, not Windows capture verification.

Pending manual acceptance in Chrome/Edge on Windows: actual Windows and Alt keys, Win+Shift+S, PrintScreen and clipboard permission outcomes; tab switching; desktop pointer leave; entering/exiting fullscreen; delayed fullscreen resume; watermark removal and restoration; limit locking; unchanged answer saves and deadline; server-received event evidence. Do not claim these checks passed before the integrated runner is available.

## Files changed and completed checks

Added under `src/features/runner/`: `useAntiScreenshot.ts`, `AntiScreenshotOverlay.tsx`, `useWatermarkTamperDetector.ts`, `security-shield.css`, `security-audit-report.ts`, and `useAntiScreenshot.test.tsx`.

Updated: `src/main.tsx`, `src/features/runner/supervision.ts`, `src/features/runner/engine.ts`, `src/features/runner/runner.test.ts`, `src/features/exams/monitor/InterruptionRecord.tsx`, `src/features/onboarding/guide.ts`, `nexora-backend/src/modules/delivery/supervision.service.ts`, `nexora-backend/test/unit/supervision.spec.ts`, and `docs/backend-handoff.md`, plus this guide.

Passed: frontend typecheck/lint/format/full test run (247 component/unit tests and 14 tooling checks), an additional runner regression (32 runner tests passed including offline shield-report delivery), 180 backend unit tests, frontend and backend builds. The production frontend build retains its existing large-chunk warning. No OS-shortcut, clipboard, fullscreen, tamper self-healing browser acceptance, or live-database verification is claimed for this incomplete integration.
