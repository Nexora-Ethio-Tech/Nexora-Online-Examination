# Browser tests and accessibility checks

`npm run e2e` now builds production and runs Playwright instead of printing a placeholder. First run `npm ci` and `npx playwright install chromium`. On Windows with installed Edge, PowerShell can use `$env:E2E_BROWSER_CHANNEL='msedge'` before the command. CI uses bundled Chromium. The suite starts its own demo server on 5178 and production preview on 4178; keep those ports free. It does not reuse the user's existing demo or modify real school data.

Projects cover desktop 1366×900, touch-enabled 360×800 demo and 360×800 production. Browser timezone is Pacific to exercise explicit EAT displays. Tests use role/label selectors, wait for saved state rather than sleeps, and retain failure screenshots/traces plus an HTML report. Open it with `npm run e2e:report`. The GitHub workflow runs checks and browser tests and uploads synthetic reports for seven days; both check and browser jobs passed on GitHub for `7da5995` in [run 38867189918](https://github.com/codifex11/Nexora-Online-Examination/actions/runs/38867189918). This verifies synthetic CI execution, not real backend acceptance.

Coverage includes invalid login, all three roles/MFA, keyboard skip navigation, student route states and preparation, teacher template upload/review/submission, administrator approval/scheduling/accommodations, monitor/device screens, recovery acceptance, CSV download/print layout, publication and practice completion, and the student runner's local saves/navigation/submission. Production tests verify cached-shell offline reload without exposing answers and API outage guidance with mocks disabled. Each browser context has fresh isolated storage. The in-memory demo cannot prove failed network writes or cross-tab persistence; offline runner coverage verifies local interaction, while the production-shell case exercises actual network-offline reload.

Shared checks run axe WCAG 2 A/AA and 2.1 AA rules without disabling violations, and assert no page-wide horizontal overflow. Fixed issues: student/admin primary text contrast on selected navigation backgrounds; added a focusable keyboard skip link to the workspace main region; made the horizontally scrollable results table keyboard-focusable with a named region. Automated axe checks do not establish full WCAG conformance, screen-reader usability or physical Android support. Nested tables may deliberately scroll within their container.

Still required: real API journeys with multi-school/student isolation, publication/practice outcomes and backend races; physical low-memory Android/browser coverage; screen-reader and full screen-state inspection; real printing and host deployment/rollback. Existing unit/API-simulator tests cover additional boundaries; they do not replace those acceptance checks. See [deploy.md](deploy.md). Cleanup is intentionally disabled per [retention-policy.md](retention-policy.md).

## Recorded local verification — 15 October 2026

- `npm run check`: typecheck, ESLint, formatting and all 181 tests across 34 files passed.
- `E2E_BROWSER_CHANNEL=msedge npm run e2e` (PowerShell environment syntax above): production build and all 12 Playwright cases passed, spanning desktop/mobile demo and production-shell projects. Axe found no violations in the checked states after the contrast/keyboard fixes. Successful demo screenshots are retained in test-results; the mobile completed-practice screenshot was visually inspected.
- Production artifact manifest: all 12 emitted-file hashes matched; this development verification build correctly records dirty:true. It is not a release artifact.
- Existing Zod annotation and large-bundle build notices remain. npm audit also reports seven high findings in the existing shadcn/tooling dependency chain; see VERSIONS.md. No forced dependency downgrade was performed.
- Real backend, actual Android/screen readers, hosting/rollback and execution of the newly added GitHub CI job remain unverified. No data or cache deletion was performed.

## Readiness follow-up

See [frontend-readiness.md](frontend-readiness.md) for navigation instructions, expanded negative-path coverage, the physical-phone and human accessibility procedure, and performance/dependency findings. The suite now includes 800×360 landscape in addition to portrait and desktop. Production tests exercise a lost final response and identical retry across reload using an intercepted synthetic API, as well as expiry, role redirects, lazy-file failure/retry and every cached shell asset while offline. This does not establish real backend behavior.

The final follow-up run passed **26 browser cases and 181 unit/component tests**; see frontend-readiness.md for exact commands, fixes and remaining evidence. Earlier results above are historical.
