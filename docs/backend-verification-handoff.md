# Backend message: frontend verification update

No new API contract is introduced by browser automation, contrast/keyboard fixes, deployment preparation or the decision to keep cleanup disabled. Continue BE-02 through BE-11 under API v0.12.

## Repository and staging update — 16 October 2026

Use [codifex11/Nexora-Online-Examination](https://github.com/codifex11/Nexora-Online-Examination), formerly exam-frontend. The frontend owner reports Ready Vercel Previews under team Nexora, with mocks disabled and `/api/v1` configured. Routing/file checks passed on `f3ffb5e`; no backend is connected, and `/api/v1/auth/me` currently returns 404. GitHub check and browser jobs passed for `7da5995` (run 38867189918). See deploy.md for precise evidence and limitations.

The release manifest now distinguishes generated Vercel metadata and equivalent JSON formatting from actual source changes; the owner verified the redeployed Preview for `33454ec8cbb0aa75c912a672651f015049054362` reports `dirty:false` and buildId `1ee71179-a400-4d5b-9633-0c4300a58e3f`. The normal build command is restored and the dashboard Override is confirmed off. GitHub check and browser jobs also passed for this commit in run 38886123546. See deploy.md for the unchanged clean-source gate and test procedure. Protected-Preview worker installation and real API integration remain unverified. These updates change no backend contract. Supply the staging API details and evidence requested below; the frontend owner must record the exact approved frontend origin before credentialed integration. A repository rename does not change API URLs or authorize guessed CORS origins.

Send this message with browser-testing.md and deploy.md:

“We added executable synthetic browser journeys and CI, mobile/accessibility checks and a frontend deployment runbook. These tests are not real backend acceptance. Continue implementing the existing v0.12 contracts and supply the staging API base URL, exact permitted frontend origin, implementation/migration revision and privately provisioned synthetic role/MFA accounts. Return the real-database evidence required by each task, especially receipt persistence, isolation, races, deadline/readiness handling, publication/practice and backup/restore. We will run joint frontend integration on that environment. Do not treat demo passes as backend completion. Local data/cache cleanup remains disabled; no new cleanup endpoint or independent retention choice is requested.”

## Additional frontend verification

The owner found no service-worker registration at `/login` on the protected Preview. Source inspection confirms registration is deferred to student preparation and runner startup through `ensureOfflineShell()`, not login. Protected installation/cache population remains untested; the normal production path requires backend student authentication, an eligible attempt, device enrollment and package delivery. The shell install fetches use `credentials: 'omit'`, whose compatibility with deployment protection remains unverified. See deploy.md for the call sites and acceptance steps. A standalone shell test would not replace integrated BE-11 readiness verification; no new endpoint is requested.

The expanded production-browser suite intercepts a synthetic API to simulate a lost committed-response, reload and retry with the same final body and idempotency key. This is evidence about browser persistence only. The backend must demonstrate that same behavior against the real database, including session expiry and deadline/restart races already required by BE-02. Route splitting and navigation changes introduce no endpoint changes. Send frontend-readiness.md alongside this message for current evidence and remaining device/host checks.

## Pre-merge hosting evidence

The owner reconfirmed /login and missing-asset routing on the 33454ec Preview, plus no-cache headers on /login, sw.js and release.json. The Production hostname nexora-online-examination.vercel.app showed Vercel login in a private window; switching protection from Standard to All Deployments is planned and awaits confirmation. See deploy.md for the exact verified build identity. Backend-dependent preparation/worker installation, cache population and the credentials-omit behavior remain untested. The planned frontend baseline merge changes no API requirements. Retain historical commit references as evidence and append the new main deployment identity after merge rather than relabeling earlier tests.
