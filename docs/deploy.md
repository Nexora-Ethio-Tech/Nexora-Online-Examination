# Frontend deployment and rollback runbook

Status: Vercel staging setup with partial host verification reported by the project owner; not production acceptance. The repository is [codifex11/Nexora-Online-Examination](https://github.com/codifex11/Nexora-Online-Examination), formerly exam-frontend. Vercel is selected; the exact staging URL and real API remain to be recorded. Do not label the MVP production-ready until the host/backend acceptance below passes.

## Staging evidence and open diagnostics — 16 October 2026

The following hosting results were reported by the project owner, not independently repeated in this documentation update:

- Vercel project is under team Nexora. Preview and Production variables are `VITE_USE_MOCKS=false` and `VITE_API_BASE_URL=/api/v1`. Standard Protection is enabled; an unauthenticated private-window visit showed Vercel login. This verifies protection for the tested URL, not every Production domain.
- The initial Production deployment built main at `8589408`. Feature branch `feat/browser-verification` contains routing configuration commit `f63f665`; Preview trigger commits `f3ffb5e` and `be77c11` reached Ready. Ready means hosting build/deployment success, not full application acceptance.
- On Preview `f3ffb5e`, `/admin/exams/example` returned the app; `/assets/missing.js` and `/api/v1/auth/me` returned 404; `/sw.js` returned JavaScript; `/release.json` was served as a file. Cache-header values have not been reported as verified. No real backend is connected, so the API 404 is expected at this stage.
- That Preview's release manifest identifies `f3ffb5e61e059f98b3db16296dd6e08da49b1c4` but reports `dirty:true`. The owner's local build of the different commit `7da5995` reported false. The changed-file list and cause remain unknown. Do not waive the clean-source release gate or force false for Vercel.
- Protected-Preview service-worker installation remains unverified, including whether shell fetches using `credentials: 'omit'` work behind deployment authentication. All real backend acceptance remains outstanding.

The intended committed build command is `npm run build`. A dashboard override attempted to append Git status, but the owner saw no output and could not establish execution. Vercel's [configuration reference](https://vercel.com/docs/project-configuration/vercel-json) confirms that `vercel.json`'s `buildCommand` overrides the dashboard setting. The owner plans a temporary committed diagnostic command with `GIT-STATUS-START` and `GIT-STATUS-END` markers around `git status --porcelain --untracked-files=all`. This is diagnostic only: restore `npm run build` and disable the dashboard Override afterward. Do not treat marker absence as a clean checkout.

Wait for the marked changed-file output before selecting a fix. The current postbuild script requires Git metadata and checks status after building; absent metadata would fail rather than yield true. Vercel's commit SHA can identify deployment provenance but does not prove source cleanliness. Only narrowly identified generated files may be excluded after investigation; tracked source or lockfile changes must remain visible. If Git status cannot be verified, do not report false. Any revised manifest semantics and release gate must be documented and tested together.

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

Record commit/build ID and backend revision. Verify direct links and refresh on each role route, MIME types/cache headers, HTTPS, real login/MFA, school/role isolation, CSRF and session restoration. Confirm no demo banner or synthetic accounts/endpoints are available. Create/import an approved test paper, schedule it in EAT, prepare through the real service-worker check and BE-11 acknowledgement, unlock at common start, save while disconnected, reconnect and obtain a matching committed receipt. Verify offline reload shows recovery guidance, retained evidence survives login expiry, results publication/practice gates and CSV/print work. Check a real lower-memory Android device. These are release gates, not claims made by the synthetic suite. Backend backup/restore, capacity and database race tests remain backend-owned acceptance.

## Rollback and incident behavior

Restore the previously accepted complete artifact and compatible API version atomically. Keep current and older hashed assets available; do not clear browser IndexedDB/cache, force a service-worker replacement or ask students to discard pending work. An already-controlled tab may keep its existing worker until closed: rollback is not an immediate client takeover. Avoid releases during active sittings; preserve evidence and coordinate unresolved submissions before asking users to reopen. Test the rollback procedure on the selected staging host before production. Record which artifact is active, affected sessions and recovery status.

Local exam-data and old-shell cleanup remain disabled by the user's decision. See [retention-policy.md](retention-policy.md). Host asset removal also needs an agreed retention and active-session policy; this guide grants no deletion permission.

## Split route assets

Feature pages now load on demand. Deploy every emitted chunk together and retain the complete older artifact for open clients. The postbuild script verifies that the service-worker manifest matches final asset bytes; any mismatch fails the build. A failed page download shows reconnect/reload guidance and does not clear exam evidence. Full shell preparation still downloads all chunks. See [frontend-readiness.md](frontend-readiness.md) for measured sizes and unresolved dependency/device checks.
