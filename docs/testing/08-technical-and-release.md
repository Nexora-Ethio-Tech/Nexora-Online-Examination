# 8. Technical verification and later release gates

[Testing home](README.md) · [Test record](TEST-RECORD.md)

These checks are for the developer/operator. A nontechnical tester can mark them Blocked and hand this page to the developer. Do not infer that a manual UI pass proves SQL permissions, races, capacity or hosted readiness.

## Automated local checks

Run from `C:\Users\kaleab\Desktop\Nexora_Exam_Platform\exam-frontend`, stopping at any failing command:

```powershell
node scripts/local-doctor.ts
node scripts/local-test.ts migrate-test
node scripts/local-test.ts test
npm --prefix nexora-backend run test:unit
npm --prefix nexora-backend run build
npm run check
npm run build
npm run e2e
```

`migrate-test` and `test` use the disposable local database; they must not target the persistent manual database. The integration browser uses port 5184. End-to-end demo/production-shell tests use 5178/4178 and are synthetic; they do not substitute for real local HTTP/database acceptance. Browser runtime installation may be required. Record exact command, commit, test count, failures and environment instead of copying old results as new passes.

## Additional technical acceptance

1. **Migration ledger.** Verify the manual and disposable databases against all SQL files in this checkout through the current latest migration (029 at this writing). Existing local test records must survive rerunning migrations. Use an empty disposable database and an upgrade fixture for migration acceptance; never reset manual data to make a test pass.
2. **Authorization/RLS.** Use restricted school and platform roles, two schools and real sessions. Check cross-school denial, role restrictions, MFA/CSRF/Origin checks, secret-column denial, safe function ownership and no RLS bypass. Frontend route hiding is not sufficient evidence.
3. **Concurrency/replay.** Check simultaneous roster/teacher numbering, rollback, continuity beyond 9999, duplicate imports, stale revisions, credential replay redaction, cancellation versus worker completion, duplicate saves/submissions, assistance approval/revocation, release-date races and immutable recovery/publication history.
4. **Workers.** Verify all configured schools are covered, stop/restart recovery, leases/retries and cancellation, parser/AI/package jobs and school fairness. Do not leave a stopped worker after the rehearsal. Use synthetic input to probe both AI providers; verify explanations and fallback behavior separately. Do not print keys.
5. **Production shell/offline.** Use a production frontend build against isolated local services to verify package integrity, persisted preparation, service-worker shell readiness, post-unlock offline answers and reconnect/recovery. Development bypass must not send readiness claims. Network loss and reload are separate scenarios.
6. **Devices/security.** Rehearse Windows capture tools, clipboard permission denial, fullscreen support, keyboards, phones, network switching and approved replacement devices. Record observed limits. Neither a simulated key event nor a black overlay proves OS screenshot prevention.
7. **Backup/restore.** Follow the dedicated backup guide in an isolated operator environment with approved TLS settings, separate keys and an empty disposable restore target. Compare schema ledger, row counts, receipts, results, pending work and owner records. Restore roles/function ownership, verify RLS and revoke restored sessions before activation. Do not run raw backup/restore commands with an unverified default `.env`; this feature does not have the local launcher's target guard.
8. **Capacity.** Run the documented real-API load harness only against an explicitly disposable target. Record workload, concurrency, latency, errors, database/worker resources and cleanup. Unit-test totals do not prove 500-student capacity.
9. **Hosting.** Rehearse the separate school/owner APIs, Vercel routing/cookies/TLS, production mocks disabled, worker execution and secret separation on an isolated hosted preview. HahuCloud remains a documented future hosting option, not a tested deployment.

Details: [Local alignment evidence](../local-release-readiness.md), [operations](../operations-development.md), [workers](../chat-change-guides/02-background-workers.md), [backup and restore](../backup-and-restore.md), [load harness](../chat-change-guides/05-load-test-harness.md), [hosting support](../chat-change-guides/06-hosting-and-repository-support.md).

## Before hosted Supabase is changed

- Resolve local failures and retain the completed test record. Unperformed checks remain explicitly open.
- Review the actual hosted migration ledger and definitions; do not blindly apply all files or trust migration numbers alone. This checkout has historical migration differences from the other agent's checkout.
- Verify a recoverable backup and isolated restore, review required backend/worker/frontend/environment changes, and obtain the user's release approval.
- Follow the [deployment developer handoff](../deployment-developer-handoff.md) for isolated hosted preview, compatible rollout and production smoke testing with synthetic accounts.

This documentation task does not push commits, deploy services, apply hosted migrations or certify production readiness.
