# Real-API load-test harness

Verified change history through `ed01fe2`, 21 October 2026. Commit(s): 601e166.

## Precisely what changed

- Added tests/load/k6-exam.js and its setup guide. It uses real synthetic credentials, cookies/CSRF, device enrollment, preparation, package checksum, unlock, periodic saves, final digests and receipt replay.
- Added explicit target confirmation and private fixture exclusions. The harness does not seed accounts or decrypt/render the downloaded paper.
- Default cohort is 500; this is a configurable test target, not an achieved capacity claim.
- Added lint globals for k6 __ENV and open.

## How to test

Read [setup and common checks](README.md) first. Backend commands run inside `nexora-backend`; browser/k6 and Git commands run from the repository root.

```powershell
# From the repository root, after isolated staging setup:
k6 run tests/load/k6-exam.js
```

1. Read tests/load/README.md and install k6 separately. Create a fresh isolated scheduled sitting with distinct synthetic students.
2. Create the private fixture with every canonical question exactly once, real test identifiers and actual schedule values. Keep it out of Git.
3. Set STUDENTS=2 first. Set TARGET_URL including /api/v1, CONFIRM_TEST_TARGET to the identical URL and FIXTURE_FILE to the private file.
4. Run the harness. Require all checks, confirmed receipts and matching replays; inspect latency thresholds and error output.
5. Independently reconcile one final submission per attempt and correct digests/grades. Record server resource and database-pool metrics.
6. Increase the cohort gradually using fresh fixtures. Report the actual achieved cohort; never infer 500-student readiness from unit tests.

## Evidence and remaining limits

No k6 run or capacity test has been performed. Load tests mutate their target; use only the isolated test deployment.

See the [detailed implementation guide](../../tests/load/README.md) and [exact commit/file inventory](COMMIT-FILE-INVENTORY.md). Record actual results using the [test report template](TEST-REPORT-TEMPLATE.md); do not mark unperformed checks as passed.
