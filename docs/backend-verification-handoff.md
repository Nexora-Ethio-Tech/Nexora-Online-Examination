# Backend message: frontend verification update

No new API contract is introduced by browser automation, contrast/keyboard fixes, deployment preparation or the decision to keep cleanup disabled. Continue BE-02 through BE-11 under API v0.12.

## Repository and staging update — 16 October 2026

Use [codifex11/Nexora-Online-Examination](https://github.com/codifex11/Nexora-Online-Examination), formerly exam-frontend. The frontend owner reports Ready Vercel Previews under team Nexora, with mocks disabled and `/api/v1` configured. Routing/file checks passed on `f3ffb5e`; no backend is connected, and `/api/v1/auth/me` currently returns 404. GitHub check and browser jobs passed for `7da5995` (run 38867189918). See deploy.md for precise evidence and limitations.

The release manifest's `dirty:true` is under investigation; temporary build-command diagnostics are not the intended deployment configuration. Protected-Preview worker installation and real API integration remain unverified. These updates change no backend contract. Supply the staging API details and evidence requested below; the frontend owner must record the exact approved frontend origin before credentialed integration. A repository rename does not change API URLs or authorize guessed CORS origins.

Send this message with browser-testing.md and deploy.md:

“We added executable synthetic browser journeys and CI, mobile/accessibility checks and a frontend deployment runbook. These tests are not real backend acceptance. Continue implementing the existing v0.12 contracts and supply the staging API base URL, exact permitted frontend origin, implementation/migration revision and privately provisioned synthetic role/MFA accounts. Return the real-database evidence required by each task, especially receipt persistence, isolation, races, deadline/readiness handling, publication/practice and backup/restore. We will run joint frontend integration on that environment. Do not treat demo passes as backend completion. Local data/cache cleanup remains disabled; no new cleanup endpoint or independent retention choice is requested.”

## Additional frontend verification

The expanded production-browser suite intercepts a synthetic API to simulate a lost committed-response, reload and retry with the same final body and idempotency key. This is evidence about browser persistence only. The backend must demonstrate that same behavior against the real database, including session expiry and deadline/restart races already required by BE-02. Route splitting and navigation changes introduce no endpoint changes. Send frontend-readiness.md alongside this message for current evidence and remaining device/host checks.
