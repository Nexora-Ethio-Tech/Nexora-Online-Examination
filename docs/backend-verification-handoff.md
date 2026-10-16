# Backend message: frontend verification update

No new API contract is introduced by browser automation, contrast/keyboard fixes, deployment preparation or the decision to keep cleanup disabled. Continue BE-02 through BE-11 under API v0.12.

Send this message with browser-testing.md and deploy.md:

“We added executable synthetic browser journeys and CI, mobile/accessibility checks and a frontend deployment runbook. These tests are not real backend acceptance. Continue implementing the existing v0.12 contracts and supply the staging API base URL, exact permitted frontend origin, implementation/migration revision and privately provisioned synthetic role/MFA accounts. Return the real-database evidence required by each task, especially receipt persistence, isolation, races, deadline/readiness handling, publication/practice and backup/restore. We will run joint frontend integration on that environment. Do not treat demo passes as backend completion. Local data/cache cleanup remains disabled; no new cleanup endpoint or independent retention choice is requested.”

## Additional frontend verification

The expanded production-browser suite intercepts a synthetic API to simulate a lost committed-response, reload and retry with the same final body and idempotency key. This is evidence about browser persistence only. The backend must demonstrate that same behavior against the real database, including session expiry and deadline/restart races already required by BE-02. Route splitting and navigation changes introduce no endpoint changes. Send frontend-readiness.md alongside this message for current evidence and remaining device/host checks.
