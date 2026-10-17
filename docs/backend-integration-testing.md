# Backend integration testing

Work branch: `feat/backend-frontend-integration`. Target: existing frontend contracts, including readiness v0.12 and the later browser-controls addition.

## Safe real-database test

The owner authorized additive migrations and synthetic records in the configured Supabase database. Do not use the legacy full backend test command on this database: some older suites reset shared data. The opt-in operational suite creates two random schools, its own users/sessions/exam and browser registrations, then deletes only those fixture records. It uses real HTTP guards, the restricted runtime database role and a controlled application clock. Most workflow fixtures insert sessions directly. A separate scoped password/TOTP/login/logout test is included; record its actual outcome separately. It does not establish the operator MFA enrollment/reset journey.

From `nexora-backend`:

```powershell
npm run build
npx vitest run test/unit
$env:RUN_SUPABASE_OPERATIONAL_TESTS='true'
npx vitest run test/operational-integration.e2e-spec.ts
Remove-Item Env:RUN_SUPABASE_OPERATIONAL_TESTS
```

The operational tests cover role and tenant denial, readiness identity and replay, monitor reads without student-contact changes, concurrent duplicate device transfer, unchanged deadline, invalidated readiness, generation checks, and replacement-browser readiness/unlock. The directory extension covers roster preview/commit replay, foreign-school denial, unchanged frozen roster, salted password hashes, and credential replay returning `credentials: null` without retaining plaintext in idempotency records.

Latest completed evidence: backend compilation, 75 unit tests and thirteen scoped Supabase operational cases passed. These include actual password/TOTP authentication, wrapped package keys, approval, scheduling, submission, publication, recovery and practice. The browser journey did not pass: its auth request returned 404 despite successful direct/proxied HTTP requests. The final Vite routing change supplies a default local API target and also configures local preview; it has not been retested because the owner requested no further checks. The newest request-limit changes also require a later integration rerun. Do not treat browser acceptance or hosted integration as complete.

To run the optional real-API Chromium journey, install the root Playwright Chromium browser, leave local port 5173 free, and add `$env:RUN_REAL_BROWSER='true'` before the operational command. It starts a mocks-disabled Vite server with a proxy to the test API, opens admin school setup and teacher results, and completes/reloads student practice. The browser uses synthetic authenticated cookies; password/TOTP coverage is a separate HTTP test. It does not test production service-worker installation, offline reload or Vercel protection.

## Local frontend connection

In the frontend's ignored local environment file, keep mocks off and configure:

```dotenv
VITE_USE_MOCKS=false
VITE_API_BASE_URL=/api/v1
API_PROXY_TARGET=http://localhost:3000
```

Start the backend on that port and restart the frontend on its permitted origin. Vite development and local preview now default to http://127.0.0.1:3000 when API_PROXY_TARGET is absent; set the variable to override the backend origin. The /api/v1 prefix is preserved. `API_PROXY_TARGET` is read only by the Vite development server and is not bundled into client JavaScript. Requests retain the frontend origin so the backend's Origin/CSRF checks still apply. This setting does not configure Vercel routing or a deployed backend URL.

## Acceptance still required

The combined HTTP flows above are covered. Broader rollback/race tests, pagination beyond 25, full browser authoring/admin scheduling/official submission, real offline retry/reload and phone testing remain acceptance work. The English synthetic AI sample passed with the configured provider. The owner deferred the Amharic check after truncation and timeout; record that gap rather than claiming multilingual acceptance. No capacity claim or hosted-backend readiness follows from the current unit and scoped integration tests.

Migration 019 fixes login/practice rate limiting by replacing the reserved CURRENT_TIME variable name with v_now (timestamptz). Apply with npm run migrate from nexora-backend. No additional test suite was run for this correction, following the owner's request.
Migration 019 was applied successfully to the configured database on 17 October 2026.
