# Preview build investigation and local fixes — 26 October 2026

## Findings

[PR #12](https://github.com/Nexora-Ethio-Tech/Nexora-Online-Examination/pull/12) is merged into `main` at `e43ecc7`. Its head was `d0cca42`. The GitHub backend, browser and check jobs passed. Its remaining failed deployment status is the standalone `nexora-owner` Preview; the three other Vercel project statuses succeeded. A failed historical deployment check does not mean the PR failed to merge or that the current Production deployment is down.

The separate email/screenshot report concerns branch `corrections`, commit `88fbe8e`, with failed Previews for `nexora-owner` and `nexora-online-examination`. Both screenshots show `API_PROXY_TARGET` missing while Vercel evaluates `vercel.ts`. Environment settings are scoped separately to Production and Preview. Saving a Production variable does not configure a Preview.

The backend build screenshot reports zero vulnerabilities. The frontend lockfile separately reported nine: four moderate and five high. Install-script notices, the unsupported `cache-dir` setting, and deprecated ESLint are warnings distinct from the missing-proxy error.

## Local changes and architecture

- Updated the frontend lockfile within compatible declared ranges using `npm audit fix --ignore-scripts`. Audit now reports zero vulnerabilities. No forced major upgrade, ignored advisory or lowered audit threshold was used.
- Added exact-version install-script approvals for esbuild in the frontend and esbuild, SWC and Argon2 in the backend. These support the existing build/native password-hashing dependencies. Future versions require another review; there is no blanket approval.
- Added a high-severity npm audit gate to the frontend CI job, matching the existing backend policy.
- Preserved strict proxy validation. A build without its required backend must fail clearly rather than silently point at production or serve fake API responses.

The installed local npm 11.11.0 does not implement `install-scripts`. The policy was validated using npm 11.21.1 without replacing the global npm installation. Both package directories reported no unreviewed install scripts on Windows. Optional dependencies installed on other operating systems may need separate review. See [npm install-script documentation](https://docs.npmjs.com/cli/v11/commands/npm-install-scripts/).

## Verification

- Frontend type checking, lint and formatting passed.
- 297 frontend tests and 18 script checks passed.
- Production frontend build and 51 browser regression tests passed.
- Backend production build passed after the package policy change.
- Both install-script policy checks passed with npm 11.21.1.
- Frontend audit: zero vulnerabilities after the lockfile update.

These are local results. They do not establish that the `corrections` branch has incorporated the fixes or that its hosted Preview succeeds.

## Pending hosting work

The owner selected an isolated test environment rather than disabling automatic Previews. Setup is paused at their request while the coworker who owns Supabase arranges access. No Vercel environment settings, project deletions, production data or production credentials were changed in this task.

When access is ready:

1. Create a separate Supabase test project, subject to available free capacity or explicit budget approval. Do not clone production school records.
2. Apply the application's migrations and provision restricted runtime roles on that test database only. Use fresh encryption, worker and account credentials.
3. Deploy a test backend and configure frontend Preview `API_PROXY_TARGET` to its HTTPS origin; use combined mode consistently. Configure only the exact authorized Preview origins in backend origin checks.
4. Test synthetic owner, school-admin, teacher and student accounts, tenant isolation, imports and MFA against the test database.
5. Decide whether to retire the old standalone owner projects. They are still connected and can continue receiving branch deployment attempts.
6. Redeploy the relevant branch after its code and Preview settings are ready. Historical failed deployment records will remain historical.

The `cache-dir` setting was not found in the inspected repository configuration; its hosting source still needs investigation. ESLint's deprecated-version warning is not the missing-proxy build failure; upgrading its major version needs a separate compatibility review.

The automatic import scheduler remains on the separate local `fix/production-import-scheduler` branch. Its production dispatcher is disabled by the owner's decision. This build-health branch does not deploy or enable it.
