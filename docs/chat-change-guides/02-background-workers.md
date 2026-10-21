# Multi-school workers and scheduler entry points

Verified change history through `ed01fe2`, 21 October 2026. Commit(s): 601e166.

## Precisely what changed

- Added an active-school sweep with cursor pagination and retained the explicit school filter.
- Worker CLI can sweep once or run continuously; packages are prioritized before imports/AI. Existing database leases coordinate repeated triggers.
- POST internal worker requests use IMPORT_WORKER_SECRET. GET supports Vercel-style CRON_SECRET authentication.
- Added operations guidance; no hosted cron schedule was enabled. A fixed GET without a school/cursor repeatedly starts at the first school.

## How to test

Read [setup and common checks](README.md) first. Backend commands run inside `nexora-backend`; browser/k6 and Git commands run from the repository root.

```powershell
npm run test:unit -- test/unit/worker-sweep.spec.ts
# The following performs real work: isolated staging only.
npm run worker -- --once
```

1. Create two active synthetic schools and an inactive school with representative queued work.
2. Run a one-shot sweep. Verify both active schools are visited and the inactive school is skipped; inspect actual job status and errors.
3. Call POST /api/v1/internal/import-worker with authorized configuration, starting with {}. Follow nextCursor as afterSchoolId until null. Verify traversal completes.
4. Try missing/wrong scheduler credentials: expect denial and no processing.
5. Retry the same cursor and run concurrent triggers. Verify leases prevent duplicate committed work using database records, not just HTTP success.
6. On staging Vercel, measure request duration and inspect timeout/retry behavior before configuring any schedule.

## Evidence and remaining limits

No hosted scheduler or real worker acceptance was performed. Continuous workers belong only on hosts that support persistent processes.

See the [detailed implementation guide](../operations-development.md) and [exact commit/file inventory](COMMIT-FILE-INVENTORY.md). Record actual results using the [test report template](TEST-REPORT-TEMPLATE.md); do not mark unperformed checks as passed.
