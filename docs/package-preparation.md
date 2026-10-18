# Immediate student paper preparation

18 October 2026. Owner-requested correction for approved papers remaining pending for minutes.

## Cause found in source

Approval inserted a durable package job but did not execute it. A scheduler or local worker had to pick it up. Both worker entry points also processed imports/AI before packages, so provider latency could delay package processing. An absent scheduler could leave a package pending indefinitely. No live deployment or database was inspected in this task, so these are source-level causes rather than a verified diagnosis of a particular hosted paper.

Package preparation reads the immutable approved version, validates a student-field allowlist, encrypts it and wraps the release key. It makes no AI/provider call.

## Changed behavior

Approval now attempts bounded package preparation inside its existing database transaction. A successful response includes packageState ready and scheduling can open immediately. A savepoint isolates validation, encryption/key-configuration and package-write failures: the approved version remains approved, the package job becomes visibly failed, and no partial package or false readiness is committed. An identical approval request still replays its original committed response without creating another version or package.

Existing pending papers have a **Prepare student paper now** button. It uses the existing authenticated, CSRF-protected, revision-bound and idempotent `POST /exams/:id/package-retry` endpoint with `{revision}`. That endpoint now also accepts pending jobs, expired processing leases and a missing queue row for an existing immutable approval, in addition to failed jobs. This explicitly extends the earlier failed-only retry rule. Active leases and already-ready artifacts are not reset; existing packages and keys are not overwritten. Tenant, administrator MFA, approval and assignment repair gates remain in force. Success runs preparation in the same request; the browser enables scheduling only after the server reports ready.

GET reads remain side-effect free. The durable worker stays available for interrupted/older jobs, and both its scheduler endpoint and local loop now run package work before import/AI work. A deployed worker is still required for imports and AI generation; it is not needed for the normal successful approval/package path after this change.

## Deployment and verification

Deploy backend and frontend together. This correction adds no migration, dependency or provider setting. The backend still requires its existing MFA_ENCRYPTION_KEY to wrap student-package keys. This task does not change hosting settings or deploy source.

Unit checks cover immediate encrypted output and wrapped keys, rejection of private fields, savepoint recovery after a database error, and preservation of existing work/leases. A frontend test covers explicitly preparing an existing pending paper and keeping scheduling hidden until a ready response. The opt-in real-database approval scenario now expects a ready response and verifies the worker finds no duplicate job afterward; that scenario has not been rerun in this task.

Real deployed approval timing, large-paper performance, concurrent worker/retry races and a hosted existing pending paper still need verification. No precise latency guarantee follows from the synthetic tests.

Recorded local verification: `npm run check` passed TypeScript, lint, formatting, 199 frontend tests and nine release-source tests. Backend compilation and all 85 backend unit tests passed. `E2E_BROWSER_CHANNEL=chrome npm run e2e -- --grep 'teacher import and review through admin approval'` built the production frontend and passed three synthetic approval/scheduling/accessibility journeys on desktop, 360px mobile and landscape. Existing build warnings about chunk size and dependency comments remain. Browser tests do not exercise the real database or establish hosted latency. Full checks/backend unit tests used execution outside the sandbox for subprocess/native-binding access; browsers used the installed Chrome.
