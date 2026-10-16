# Frontend deployment and rollback runbook

Status: Vercel staging setup with partial host verification reported by the project owner; not production acceptance. The repository is [codifex11/Nexora-Online-Examination](https://github.com/codifex11/Nexora-Online-Examination), formerly exam-frontend. Vercel is selected; the exact staging URL and real API remain to be recorded. Do not label the MVP production-ready until the host/backend acceptance below passes.

## Staging evidence and open diagnostics — 16 October 2026

The following hosting results were reported by the project owner, not independently repeated in this documentation update:

- Vercel project is under team Nexora. Preview and Production variables are `VITE_USE_MOCKS=false` and `VITE_API_BASE_URL=/api/v1`. Standard Protection is enabled; an unauthenticated private-window visit showed Vercel login. This verifies protection for the tested URL, not every Production domain.
- The initial Production deployment built main at `8589408`. Feature branch `feat/browser-verification` contains routing configuration commit `f63f665`; Preview trigger commits `f3ffb5e` and `be77c11` reached Ready. Ready means hosting build/deployment success, not full application acceptance.
- On Preview `f3ffb5e`, `/admin/exams/example` returned the app; `/assets/missing.js` and `/api/v1/auth/me` returned 404; `/sw.js` returned JavaScript; `/release.json` was served as a file. Cache-header verification on the later redeployed Preview is recorded below. No real backend is connected, so the API 404 is expected at this stage.
- That Preview's release manifest identifies `f3ffb5e61e059f98b3db16296dd6e08da49b1c4` but reports `dirty:true`. The owner's local build of the different commit `7da5995` reported false. Subsequent owner-supplied diagnostics listed an unstaged vercel.json change and two generated files under .vercel; the configuration diff showed JSON compacted onto one line. Do not waive the clean-source release gate or force false for Vercel.
- Protected-Preview service-worker installation remains unverified, including whether shell fetches using `credentials: 'omit'` work behind deployment authentication. All real backend acceptance remains outstanding.

The normal committed build command is restored to `npm run build`; the owner confirms the dashboard Build Command Override is off. Vercel's [configuration reference](https://vercel.com/docs/project-configuration/vercel-json) confirms that the committed buildCommand overrides that dashboard setting. Diagnostic commands are not part of the intended release configuration.

The release-source check now ignores generated `.vercel/` files through `.gitignore`. It tolerates only an unstaged content change to `vercel.json` whose parsed JSON equals HEAD, ignoring whitespace and object-key order but preserving array order and values. Staged changes, file-mode changes, invalid JSON, deletions, other tracked modifications and non-ignored untracked files remain dirty. This is a semantic source-cleanliness check, not byte identity of the checkout. The manifest still hashes the actual emitted artifact bytes independently.

Git metadata remains required; missing metadata fails the build rather than asserting clean source. On Vercel, an exposed `VERCEL_GIT_COMMIT_SHA` must be a valid SHA matching HEAD; mismatch fails. Without that variable, Git HEAD supplies the identity. Neither the variable nor the hosting provider forces dirty to false. The clean-source release gate remains `dirty:false` under these documented rules.

### Verify the manifest fix

Run `npm run check` (including temporary-Git-repository tests for the source check) and `npm run build`. A build before committing these changes correctly reports dirty. After committing, build from a clean checkout and verify `dist/release.json` has the expected full commit and `dirty:false`. Local source/config changes must still produce true; malformed or mismatched Vercel SHA must fail.

After the fix is pushed, open the new protected Preview's `/release.json`. Confirm its full commit matches the deployment and dirty is false. If true persists, collect the changed-file list rather than widening exclusions. Owner-reported hosted verification passed on the redeployed Preview for `33454ec`: commit `33454ec8cbb0aa75c912a672651f015049054362`, `dirty:false`, buildId `1ee71179-a400-4d5b-9633-0c4300a58e3f`. Dashboard Build Command Override is confirmed off. This closes the reported manifest diagnostic; no backend or protected-worker acceptance is implied. Keep the dashboard Build Command Override off.

GitHub CI is no longer unverified: commit `7da5995` passed both check and browser jobs in [run 38867189918](https://github.com/codifex11/Nexora-Online-Examination/actions/runs/38867189918), verified in the preceding repository review. This does not establish CI results for later diagnostic commits.

## Build a reviewable release

Use Node 24 (verified locally: 24.14.1), npm and the committed package-lock.json. From a clean checkout of the intended commit, run `npm ci`, `npm run check`, `npx playwright install chromium`, then `npm run e2e`. The e2e script first builds production assets and runs isolated demo journeys plus production-shell tests. These use synthetic data, not the real API. Linux CI installs Chromium with system dependencies through the workflow.

Set public build variables before building: `VITE_API_BASE_URL=/api/v1` for same-origin routing, or the actual approved HTTPS API base; `VITE_USE_MOCKS=false`. Never put passwords, signing keys, database URLs or private tokens in VITE variables: they are public bundle content. Production builds reject demo mode or mocks enabled. Run `npm run build` for the final configuration. Do not deploy Vite's development or preview server as a production host.

Deploy the complete `dist` artifact. `dist/release.json` records Git commit, whether the checkout was dirty, service-worker build ID and SHA-256 hashes of the other emitted files. Require `dirty:false` for a release. Archive that exact artifact and test report; do not rebuild between acceptance and deployment because every build has a different shell ID. The manifest contains no credentials. Verify downloaded deployment files against it; record host/domain/API revision alongside the artifact externally.

## Host requirements

- Serve over HTTPS at the origin root. The current router, shell paths and manifest assume root hosting; a subdirectory deployment requires a separate tested change.
- Serve real static files first. For application routes `/`, `/login`, `/mfa`, `/student/*`, `/teacher/*`, `/admin/*`, return `index.html` for direct navigation. Missing assets must return a real 404, not index.html.
- Route `/api/v1/*` to the backend when using same-origin routing; never rewrite API errors to HTML. For a separate API origin, configure the exact credentialed frontend origin, session-cookie policy and CSRF/Origin checks with the backend. Do not use wildcard credentialed CORS.
- Serve `sw.js` with JavaScript MIME type and revalidation/no-cache; serve HTML and release.json with revalidation/no-cache. Hashed assets may use long immutable caching. Verify no intermediate cache stores private API responses.
- Publish atomically and retain previously deployed hashed asset URLs for open clients. Do not delete old assets while an exam may depend on them. Current service workers deliberately avoid skipWaiting, claiming existing clients or deleting old caches.

## Smoke tests on the actual host

### Protected Preview service-worker status

The owner inspected DevTools > Application > Service Workers on the protected Preview's `/login` and found no registration for that origin. This is expected for a fresh origin at login: there is no registration on login or application startup. It is not evidence of a failed installation, successful installation or populated cache.

Registration occurs in `src/lib/offline-shell.ts`, inside `ensureOfflineShell()`, through `navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })`. Production callers are student preparation (`src/features/exams/preparation.ts`, after server enrollment/attempt/package requests, package integrity verification and local package storage) and the exam runner (`src/features/runner/engine.ts`, after attempt/device checks and obtaining the package, before unlock). Development mode bypasses registration. Preparation reports BE-11 readiness only after the worker verifies the expected shell version and cached bytes.

Service-worker installation and complete cache population on the protected Preview remain **untested**. Exercising the normal production application flow depends on a working backend with authenticated student access, an eligible scheduled attempt, device enrollment and an encrypted package. A standalone manual worker test could isolate hosting behavior without a backend, but has not been performed and would not establish end-to-end preparation readiness. Loading `/sw.js` successfully is insufficient.

The install handler in `scripts/offline-shell.ts` fetches shell assets with `credentials: 'omit'`; whether those requests succeed behind Vercel Deployment Protection remains an open question. Registration alone is insufficient: verify activation, every expected cached asset and checksum, the matching build/version response, and readiness acknowledgement through the real preparation flow. Record any authentication redirects or rejected asset fetches. This remains a backend-dependent integration acceptance item for the normal flow, not a failed login-page check or a new backend endpoint requirement.

Record commit/build ID and backend revision. Verify direct links and refresh on each role route, MIME types/cache headers, HTTPS, real login/MFA, school/role isolation, CSRF and session restoration. Confirm no demo banner or synthetic accounts/endpoints are available. Create/import an approved test paper, schedule it in EAT, prepare through the real service-worker check and BE-11 acknowledgement, unlock at common start, save while disconnected, reconnect and obtain a matching committed receipt. Verify offline reload shows recovery guidance, retained evidence survives login expiry, results publication/practice gates and CSV/print work. Check a real lower-memory Android device. These are release gates, not claims made by the synthetic suite. Backend backup/restore, capacity and database race tests remain backend-owned acceptance.

## Rollback and incident behavior

Restore the previously accepted complete artifact and compatible API version atomically. Keep current and older hashed assets available; do not clear browser IndexedDB/cache, force a service-worker replacement or ask students to discard pending work. An already-controlled tab may keep its existing worker until closed: rollback is not an immediate client takeover. Avoid releases during active sittings; preserve evidence and coordinate unresolved submissions before asking users to reopen. Test the rollback procedure on the selected staging host before production. Record which artifact is active, affected sessions and recovery status.

Local exam-data and old-shell cleanup remain disabled by the user's decision. See [retention-policy.md](retention-policy.md). Host asset removal also needs an agreed retention and active-session policy; this guide grants no deletion permission.

## Split route assets

Feature pages now load on demand. Deploy every emitted chunk together and retain the complete older artifact for open clients. The postbuild script verifies that the service-worker manifest matches final asset bytes; any mismatch fails the build. A failed page download shows reconnect/reload guidance and does not clear exam evidence. Full shell preparation still downloads all chunks. See [frontend-readiness.md](frontend-readiness.md) for measured sizes and unresolved dependency/device checks.

## Merge readiness after the manifest verification

GitHub CI for `33454ec` passed both `check` and `browser` jobs in [run 38886123546](https://github.com/codifex11/Nexora-Online-Examination/actions/runs/38886123546), independently checked during this documentation update. A fresh fetch showed main at `8589408`, with the feature branch ten commits ahead and zero behind before this documentation commit; no rebase or conflict resolution was needed at that point. Recheck the final PR state if either branch changes.

Before merging, push all intended documentation commits and require successful checks on the final PR head. Review the complete diff and confirm the intended main deployment behavior: main is the configured Production branch, so merging can trigger a Production deployment. A protected Preview does not establish that Production domains are private. Keep an unfinished frontend private or deliberately accept its limited, no-backend availability before merging into an automatically deployed branch.

The owner has now verified cache headers for /login, sw.js and release.json on the redeployed 33454ec Preview. Protected-Preview service-worker installation/cache population remains untested (including the credentials-omit concern); the normal application flow depends on the backend. Record the exact Preview URL alongside the verified build identity. These are recommended staging acceptance checks before promoting this branch; do not confuse a successful script response with successful worker installation. An explicit decision may merge a frontend baseline with these checks still tracked as open, but must not label that merge a verified production release.

Real API login/MFA, authorization, exam delivery, persistence/recovery, real-device testing, rollback/old-asset availability and capacity acceptance remain release gates. They do not prevent maintaining a frontend-only baseline on main when its deployment exposure is intentional. No backend contract changes are introduced by this verification record.

## Owner-reported pre-PR verification

On the redeployed Preview for `33454ec8cbb0aa75c912a672651f015049054362`, the owner reconfirmed `/login` renders the app and `/assets/missing.js` returns a real 404. DevTools showed `cache-control: no-cache, max-age=0, must-revalidate` for `/login`, `/sw.js` and `/release.json`. The verified manifest remains `dirty:false`, buildId `1ee71179-a400-4d5b-9633-0c4300a58e3f`, with the dashboard Build Command Override off. These are owner-reported observations, not a new independent hosted test.

The owner also observed Vercel login in a private window at `https://nexora-online-examination.vercel.app` while Standard Protection was configured. This establishes access protection for that tested hostname at that time, not all future domains. Switching to All Deployments is planned, not yet confirmed complete. Save and verify that setting before merging; repeat the unauthenticated check after deployment. Changing protection for real student use is a separate launch decision after backend and release acceptance.

The owner confirms `a9d54a6` and `75b8e15` were pushed. A fresh fetch before this record showed the branch twelve commits ahead and zero behind main. The proposed PR is base `main`, compare `feat/browser-verification`, titled "Browser tests, accessibility fixes, route splitting and Vercel staging config". No merge is performed by this documentation update.

Squash and merge is recommended for this accumulated branch, which includes temporary diagnostic and empty deployment-trigger commits. Keep the PR description's historical test/deployment evidence and unresolved backend/worker acceptance items. The resulting squash commit is the new main source identity; do not rewrite earlier SHA/buildId evidence to claim it tested that new artifact. Append the actual main commit, new deployment URL/buildId, dirty status, checks and protection observation after deployment. No runtime code or backend contract needs updating solely because GitHub creates a new SHA.

This record itself creates a newer branch commit than `75b8e15`. Push it before merging and wait for both check and browser jobs on the final PR revision, as well as GitHub's mergeability confirmation. Existing successful checks on an earlier commit do not automatically cover later documentation commits. After merging, verify main CI and Vercel Ready, compare `/release.json` to the actual new main SHA, require dirty:false, and repeat route/cache/protection smoke tests. A fresh buildId is expected on each build, including a redeployment of the same commit. Preserve this as a private frontend baseline; backend and protected-worker acceptance remain open.
