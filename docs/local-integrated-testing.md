# Local integrated testing

This setup uses the actual frontend, NestJS API and PostgreSQL, with mocks disabled. It does not connect to the existing hosted Supabase database. Private passwords, encryption keys and database files are in the workspace's `.local-test` folder outside this Git checkout.

## Separate data lifetimes

- `nexora_manual_test`: persistent manual testing. Accounts, classes, exams and results created here remain after restarting the application. No automatic test cleanup targets this database.
- `nexora_be02a_test`: disposable integration testing. Automated suites create and remove synthetic records here. Do not create accounts you want to retain in this database.
- The `DEMO-*` frontend accounts still belong only to the in-memory demo transport. They are not imported into either PostgreSQL database.

## Launch

Run commands from `C:\Users\kaleab\Desktop\Nexora_Exam_Platform\exam-frontend`.

Start PostgreSQL once (an already-running instance may report that it is running):

```powershell
node scripts/local-test.ts db
```

In separate PowerShell terminals, keep these running:

```powershell
node scripts/local-test.ts backend
```

```powershell
node scripts/local-test.ts platform
```

```powershell
node scripts/local-test.ts frontend
```

For real upload processing, keep a fourth terminal running:

```powershell
node scripts/local-test.ts worker
```

The worker must print `Worker ready`. Its private manual configuration includes `WORKER_SCHOOL_IDS`; add any newly created test schools to that comma-separated UUID list and restart the worker. File uploads stay queued when the worker is stopped. See [import recovery and AI testing](import-worker-recovery-and-ai-testing.md) for provider checks and troubleshooting.

Open http://127.0.0.1:5183. Use the [private local test accounts](../../.local-test/LOCAL-TEST-ACCOUNTS.md), not the DEMO passwords. MFA remains enabled. The platform API uses port 3101 and its separate restricted database role; school API uses port 3100. PostgreSQL uses loopback port 55432.

After code changes, rebuild the backend with `npm run build` in `nexora-backend` before restarting it. Stop frontend/backend terminal processes with Ctrl+C. Stopping an application does not delete database records.

## Automated real integration

The automated browser uses port 5184, separately from your manual frontend on 5183. Run:

```powershell
node scripts/local-test.ts test
```

The launcher validates all database URLs against the designated local host, port and database names before starting. It overrides connection settings per process; it does not rewrite `nexora-backend/.env`. The operational suite exercises actual HTTP guards and SQL, then a real browser journey. Its API fixtures use a controlled clock; browser session cookies in that suite are synthetic fixtures. Password/MFA checks are separate HTTP cases. This is not proof of production hosting, physical-device behavior, load capacity or AI quality.

## Verification record

Verified 22 October 2026:

- PostgreSQL 18.6 initialized on loopback with SCRAM password authentication. Binaries came from EDB's official download host.
- All 23 SQL files in this checkout (001–020, 022–024; no 021 file exists here) applied successfully to the empty local database. The disposable database was cloned from that empty migrated schema before creating manual accounts.
- 18 integration cases passed: 14 real HTTP/browser operational cases plus 4 migration-024 checks for the archive column, forced RLS, cross-tenant denial, concurrent numbering, rollback and continuation through 10000.
- Separate browser checks passed for real school-admin and platform-owner password/MFA login, directory/school listing and session persistence across reload.
- Frontend build and check passed: 229 frontend tests, 9 release checks and 5 local-database configuration safeguards. School health/readiness and frontend endpoints returned HTTP 200; SQL confirmed zero DEMO accounts in the manual database.
- Backend build and 161 unit tests passed using the existing TypeScript compiler. Windows application control blocked the former native SWC test binding; no OS policy was changed.
- Fixed the integration harness to wait for its own Vite process on port 5184, preventing false readiness from an unrelated application on 5173. Added fixture-scoped cleanup for school_student_counters.
- Manual test accounts are synthetic, MFA enabled and stored only in the local manual database. Credentials and keys are outside Git. Existing Supabase environment files were not rewritten, and no hosted migration was run.

This validates migration 024 on an isolated database; production/Supabase ledger reconciliation still remains. Full manual authoring-to-exam workflows, assistance, live AI-provider quality, backup restoration, physical-device captures and load testing are not all certified by these checks. The worker uses the existing privately configured AI provider when an authorized manual upload requests AI; no paid provider run is claimed here.
