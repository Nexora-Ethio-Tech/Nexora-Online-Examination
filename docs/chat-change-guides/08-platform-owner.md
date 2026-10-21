# Isolated platform-owner portal

Verified change history through `ed01fe2`, 21 October 2026. Commit(s): 538670a.

## Precisely what changed

- Added migration 023 with separate owner accounts, sessions, audits, operations and subscriptions; dedicated restricted runtime and operation roles preserve school isolation.
- Added separate owner backend mode (NEXORA_SERVICE=platform), frontend surface (/platform, optionally VITE_APP_SURFACE=platform) and owner API client/session.
- Added private operator commands for runtime provisioning and owner create/recover/disable; confirmed MFA, separate encryption key, short-lived sessions, Origin/CSRF checks and fresh codes for actions.
- Portal supports school directory/counts, new school with trial and inactive admin, additional admins, scoped password/MFA recovery and emergency suspension/reactivation.
- Manual subscription states and expiry gate new scheduling/rescheduling, while existing exam delivery/saves/receipts/results continue. Emergency suspension is distinct and revokes school sessions.
- Added bounded health snapshots, paginated platform audit export, optimistic revisions, idempotent actions and one-time credentials held only in component memory.
- Extended backups to include platform records. No arbitrary tenant impersonation, answer-key access, SQL console or payment processing was added.

## How to test

Read [setup and common checks](README.md) first. Backend commands run inside `nexora-backend`; browser/k6 and Git commands run from the repository root.

```powershell
npm run test:unit -- test/unit/platform.spec.ts
```

1. Reconcile and apply migration 023 to isolated staging before using the new school scheduling code. Follow the detailed guide for separate origins, credentials, TLS and operator enrollment.
2. Provision an owner privately, then log in at /platform using password and a fresh authenticator code. School cookies/accounts must not authorize owner operations.
3. Create two synthetic schools. Confirm each admin is inactive until school MFA enrollment and sees only its own school afterward.
4. Inspect one school's admins with a reason; create/reset an admin. Confirm only the selected account changes and sessions are revoked; optional MFA reset requires re-enrollment.
5. Retry a committed action after a lost response. Expect the same outcome, no duplicate account and credential:null. A changed payload with the same key must conflict.
6. Restrict or expire a subscription. New schedules/reschedules must fail while an existing exam still saves/submits. Separately test emergency suspension and its session revocation.
7. Verify health counts against database state and export one audit page; do not interpret queue counts as worker-liveness proof.
8. Test wrong/reused codes, expiry, owner disable/recovery and cross-origin requests. Verify restricted DB roles cannot read school secrets/answers or update/delete platform audit records.
9. Run concurrency cases from the detailed guide; unit mocks do not execute SQL grants, RLS or transaction races.

## Evidence and remaining limits

Migration 023, first-owner enrollment and real database/browser staging acceptance have not been performed. Separate owner frontend/backend deployment is required for the documented isolation.

See the [detailed implementation guide](../platform-owner-architecture-and-testing.md) and [exact commit/file inventory](COMMIT-FILE-INVENTORY.md). Record actual results using the [test report template](TEST-REPORT-TEMPLATE.md); do not mark unperformed checks as passed.
