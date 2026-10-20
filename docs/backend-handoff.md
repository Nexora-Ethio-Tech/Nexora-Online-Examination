# Local backend handoff

Updated 20 October 2026. These contracts are implemented on the local development branch. This is not a record of production migration or deployment acceptance.

- Exam assistance: `invigilation-architecture-and-testing-plan.md` documents the API, assignment/approval model, migration 022 and testing evidence.
- Platform owner: `platform-owner-architecture-and-testing.md` documents the separate identity/API/deployment mode, restricted grants, migration 023, operator workflows and tests. The school backend now checks the subscription table when creating or rescheduling a sitting; apply the reconciled database migration before deploying that backend.
- Backups now include the platform schema. Use the updated `backup-and-restore.md` for the required role, key and ownership restore checks.

Before staging or production changes, reconcile the target's historical 020/021 migration definitions with this branch. Do not run the complete migration bundle against an unverified production ledger. Record real database, cookie/Origin, concurrency and device acceptance separately from the local unit/build results.
