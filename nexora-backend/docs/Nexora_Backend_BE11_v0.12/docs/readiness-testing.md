# Preparation readiness testing

Frontend and simulator implementation of audit F-06; real integration requires [BE-11](backend-readiness-task.md), API v0.12. This adds a report after existing local verification, not an alternative exam timer or submission state.

## What to check

1. In a production build connected to a BE-11 backend, schedule a future approved exam. Sign in as the student during preparation and download the encrypted paper. Expect the existing checks followed by **Report verified preparation to your school**. Success says the verified preparation was reported.
2. Open the administrator sitting monitor. **Ready (last reported)** should increase by one; Preparing still includes that student and the six status counts still sum to the roster. The student's preparation report shows an EAT timestamp and the limitation about ongoing connectivity/storage. Merely opening monitor or downloading a package must not create this report.
3. Simulate checksum failure, local-write failure or offline-shell failure: preparation must stop before reporting. Refresh monitor: the initial ready count remains zero. If a student previously reported, that timestamp remains historical evidence, not a live assertion that later checks succeed.
4. Lose the acknowledgement response after the server commits it. The student sees that local checks passed but the school report is unconfirmed. Retry preparation; the same unchanged identity/build uses the same retained key and the server returns the original acknowledgement/time. No duplicate report should result. Keep storage intact. The original deadline applies; use Open saved attempt at start if reporting is unavailable and normal unlock checks permit it.
5. Approve a replacement browser. Ready count falls and the student's current report becomes null. The old generation cannot report again. The replacement browser must verify and report independently. Package/version/schedule changes likewise invalidate old reports.
6. At unlock, the student moves to Active and leaves the ready subset. Their report remains visible as historical metadata. At their deadline, they cannot remain counted ready. Extra-time students use their personal deadline.
7. Refresh repeatedly or lose admin connectivity: receivedAt must not move simply because the administrator reads it. Monitor's existing stale-snapshot guidance continues to apply.

## Development demo and automated verification

`npm run dev:demo` skips the production service-worker check. It intentionally does not send a verified readiness report; Ready therefore stays zero for ordinary demo preparation. Student text explains this. Do not change that to produce a misleading green status.

The simulator supports the real acknowledgement shape. Automated preparation tests substitute a successful shell checker to exercise reporting and lost responses; API tests exercise count/replay/device/role/deadline behavior. These are synthetic tests. A production-browser check with intercepted API responses can verify UI layout, but full readiness acceptance requires HTTPS, the actual service worker and real BE-11 endpoints. Real-device and multi-student database acceptance remain separate work.

Run `npm run check` and `npm run build`. Send the BE-11 package and the message in its backend task to the backend developer. No retention cleanup or deletion is introduced by this feature.

## Recorded verification — 15 October 2026

- `npm run check`: passed type checking, lint, formatting and 181 tests across 34 files. An existing development-mode text assertion was updated to verify the new explicit no-report message.
- `npm run build`: passed; existing Zod annotation notices and bundle-size warning remain.
- Built production monitor in Edge with intercepted synthetic responses: passed at 360 × 800 and 1366 × 900 with a Pacific browser timezone. Verified readiness subset, EAT timestamp, refresh and report invalidation; no horizontal overflow or page errors. Mobile screenshot visually inspected.
- This browser check did not exercise a real backend acknowledgement. Actual service-worker-to-backend reporting, real devices, persistence, races and multiple students remain acceptance work under BE-11/F-07.
