# Encrypted application backup and restore

Verified change history through `ed01fe2`, 21 October 2026. Commit(s): 601e166; extended by 538670a.

## Precisely what changed

- Added db:backup/db:restore scripts and a versioned AES-256-GCM encrypted envelope using a separate 32-byte base64url BACKUP_ENCRYPTION_KEY.
- Backs up public and, after the platform feature, platform application schemas. Roles, external secrets, Supabase-managed schemas and external files are outside the archive.
- Refuses overwriting an existing backup. Restores authenticate the archive first, require explicit confirmation and an empty target, and reject configured application connection identities.
- Added a 256 MiB archive limit and TLS verification requirements. Platform restore requires restoring restricted function ownership and revoking restored sessions.
- Added *.nexora-backup to Git exclusions.

## How to test

Read [setup and common checks](README.md) first. Backend commands run inside `nexora-backend`; browser/k6 and Git commands run from the repository root.

```powershell
npm run test:unit -- test/unit/backup-envelope.spec.ts
```

1. Run the crypto tests: wrong key, tampering and invalid envelope must fail.
2. Follow the linked guide to configure compatible PostgreSQL client tools, an isolated source, separate empty target and privately stored keys.
3. Back up a synthetic school with known answers, receipts and owner records. Verify a file is created and a repeat to the same path fails without overwriting it.
4. Try a tampered archive and wrong key against the disposable target: expect failure before restore.
5. Restore the untouched archive to the empty target. Compare schema ledger, counts, receipt digests, result snapshots, pending recovery and platform audits.
6. Re-establish roles/function ownership and supply separately backed-up keys. Verify two-school isolation and both school/owner logins; revoke restored sessions before activating a restored environment.
7. Try a nonempty disposable target: expect refusal. Never test this safeguard against production.

## Evidence and remaining limits

Crypto tests passed; no real dump/restore rehearsal was performed. The linked guide contains the actual backup/restore commands and required protected configuration.

See the [detailed implementation guide](../backup-and-restore.md) and [exact commit/file inventory](COMMIT-FILE-INVENTORY.md). Record actual results using the [test report template](TEST-REPORT-TEMPLATE.md); do not mark unperformed checks as passed.
