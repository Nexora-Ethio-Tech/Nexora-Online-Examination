# Backend integration testing

Work branch: `feat/backend-frontend-integration`. Target: existing frontend contracts, including readiness v0.12 and the later browser-controls addition.

## Safe real-database test

The owner authorized additive migrations and synthetic records in the configured Supabase database. Do not use the legacy full backend test command on this database: some older suites reset shared data. The opt-in operational suite creates two random schools, its own users/sessions/exam and browser registrations, then deletes only those fixture records. It uses real HTTP guards, the restricted runtime database role and a controlled application clock. It inserts test sessions directly; it does not prove the login/MFA enrollment journey.

From `nexora-backend`:

```powershell
npm run build
npx vitest run test/unit
$env:RUN_SUPABASE_OPERATIONAL_TESTS='true'
npx vitest run test/operational-integration.e2e-spec.ts
Remove-Item Env:RUN_SUPABASE_OPERATIONAL_TESTS
```

The operational tests cover role and tenant denial, readiness identity and replay, monitor reads without student-contact changes, concurrent duplicate device transfer, unchanged deadline, invalidated readiness, generation checks, and replacement-browser readiness/unlock. The directory extension covers roster preview/commit replay, foreign-school denial, unchanged frozen roster, salted password hashes, and credential replay returning `credentials: null` without retaining plaintext in idempotency records.

Current evidence: backend compilation and 68 unit tests passed. All eight expanded operational tests passed against Supabase (99 seconds), including authoring and durable import, including teardown of the synthetic records. The two authoring cases also passed after aligning first-create/replay HTTP status codes. Earlier runs identified a multipart-limit bug (corrected) and transient network/query delays. These tests are correctness checks, not latency or capacity acceptance.

## Local frontend connection

In the frontend's ignored local environment file, keep mocks off and configure:

```dotenv
VITE_USE_MOCKS=false
VITE_API_BASE_URL=/api/v1
API_PROXY_TARGET=http://localhost:3000
```

Start the backend on that port and the frontend on its permitted origin. `API_PROXY_TARGET` is read only by the Vite development server and is not bundled into client JavaScript. Requests retain the frontend origin so the backend's Origin/CSRF checks still apply. This setting does not configure Vercel routing or a deployed backend URL.

## Acceptance still required

Full teacher import/review/submit, admin approval and schedule, preparation/unlock, offline retry and receipt recovery, publication, practice, recovery review, and mobile/browser testing remain required against the real combined API. The English synthetic AI sample passed with the configured provider. The owner deferred the Amharic check after truncation and timeout; record that gap rather than claiming multilingual acceptance. No capacity claim or hosted-backend readiness follows from the current unit and scoped integration tests.
