# Hosting guidance and repository support changes

Verified change history through `ed01fe2`, 21 October 2026. Commit(s): 601e166; 538670a; b7d893f.

## Precisely what changed

- Kept Vercel as the current hosting target and documented HahuCloud as a future option; no HahuCloud deployment was implemented.
- Added a platform-only Vercel rewrite example. It is a template with a placeholder backend, not active deployment configuration.
- Updated dependency/version records for bundled fonts and k6 lint globals. Ignored encrypted archives and private load fixtures.
- Expanded architecture, migration, backup and handoff guides. Commit b7d893f restored earlier backend-handoff history while preserving new notes.

## How to test

Read [setup and common checks](README.md) first. Backend commands run inside `nexora-backend`; browser/k6 and Git commands run from the repository root.

```powershell
git check-ignore example.nexora-backup tests/load/example.private.json
```

1. Run the standard checks from README.md and review the exact file inventory for configuration/documentation changes.
2. Verify archives and private fixtures are ignored with git check-ignore against synthetic filenames, without creating real credentials.
3. Compare the handoff document with its baseline history: earlier integration contracts should remain present.
4. Treat the HahuCloud checklist as questions to verify with that host: Node/native modules, process supervision, TLS, proxy/cookies, limits and workers.
5. For any future hosting rehearsal, use separate staging projects and record routing, cookie/Origin, TLS, migrations and worker outcomes. A successful local build alone is insufficient.

## Evidence and remaining limits

No push, deployment, production migration or hosting account change was performed. The pre-existing deletion of nexora-backend/.env.example was not part of our changes.

See the [detailed implementation guide](../deploy-hahucloud.md) and [exact commit/file inventory](COMMIT-FILE-INVENTORY.md). Record actual results using the [test report template](TEST-REPORT-TEMPLATE.md); do not mark unperformed checks as passed.
