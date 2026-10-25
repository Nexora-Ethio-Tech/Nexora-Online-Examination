# Production database migration — 25 October 2026

## Result

The configured hosted Supabase database was migrated successfully with owner authorization. All repository migrations through `033_assistance_history.sql` are recorded; no repository migrations remain pending. This is database verification, not confirmation that the deployed website has passed an end-to-end smoke test.

Applied: `020_ai_exam_generation.sql`, and migrations 022 through 033. The pre-existing records `005_authoring_and_imports.sql`, `020_invigilator_assignments.sql` and `021_exam_clarifications_and_facilitator.sql` were preserved. Do not remove or renumber those historical records.

## Backup and rehearsal

- Created an authenticated encrypted backup of the public/platform application schemas before migration. The archive was 472,689 bytes before encryption.
- Kept the backup, separate encryption-key file, schema inventories and operator helper outside the Git repository under the owner's private `.local-test/production-migration-20261025` directory. They must not be committed, uploaded to the repository or sent in chat. Store the backup and key securely for recovery.
- Restored the backup into a separate local UTF-8 PostgreSQL cluster on port 55433, independent of normal manual/disposable test databases.
- Verified matching migration records and counts for all 44 original application tables, then rehearsed all 13 migrations successfully.
- This backup covers application schemas, not Supabase-managed auth/storage schemas or a complete provider disaster-recovery snapshot.

## Production execution and permission adjustment

The first production transaction rolled back at migration 030 because Supabase's non-superuser migration account required the new function owner to have CREATE permission on the containing schema. No migrations from that transaction remained applied.

The successful retry applied the unchanged repository SQL files and inserted their migration ledger entries in one transaction, protected by the existing migration advisory lock, a five-second lock timeout and a sixty-second per-statement timeout.

Within that transaction only, after migration 023 created the platform roles, the operator granted CREATE on schemas public and platform to `nexora_platform_ops` for the subsequent function ownership changes. Both grants were explicitly revoked and verified absent before commit. No superuser or BYPASSRLS privilege was granted to application roles.

For another hosted database upgrading from this earlier baseline, account for this ownership-transfer requirement in the migration procedure. Do not assume the unchanged generic migration runner alone handles it, and do not leave broad schema CREATE privileges enabled. Already-applied migrations must not be rewritten to hide the operational difference.

## Post-migration verification

- Migration transaction committed; repository pending list is empty.
- All original non-ledger table row counts were unchanged; there are now 55 application tables.
- Original historical migration records were retained.
- `nexora_runtime`, `nexora_platform` and `nexora_platform_ops` remain non-superuser roles without BYPASSRLS.
- All six newly added public tenant tables have enabled and forced row-level security.
- Runtime queries using a nonexistent tenant returned no rows from those tables.
- Worker discovery returned no more than its two-school page limit.
- Enrollment lookup for a nonexistent token returned no records.
- Runtime/profile column access and platform school-number/profile reads succeeded under their respective roles.
- Temporary schema CREATE permissions were removed before commit.

These are bounded schema/permission checks, not exhaustive security certification. No production test accounts were inserted, no local test accounts were copied to Supabase, and no production application keys or passwords were changed.

## Follow-up application checks

Verify the school API, separate owner API, frontend and worker are deployed from the intended revision with their correct restricted credentials. Confirm owner provisioning/enrollment configuration separately; creating the platform schema does not create a production platform-owner login.

Smoke-test existing-account login, school setup, authoring/import worker processing, approval/package preparation and staff assistance through the hosted application. Confirm the new school codes before distributing newly generated IDs. Do not assume local accounts/passwords exist in production.

If application errors occur, preserve logs without secrets and reconcile deployed code/configuration before attempting additional schema edits. Do not delete production data, drop new tables or erase migration history as a blind rollback. Use the protected backup and a reviewed recovery procedure if restoration is actually required.
