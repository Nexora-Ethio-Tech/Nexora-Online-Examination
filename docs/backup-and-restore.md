# Independent application backup and restore

The CLI uses PostgreSQL custom-format archives for the entire `public` application schema: application tables, sequences, functions and policies. It does not maintain a fixed table list or silently skip conflicting rows. It excludes Supabase-managed auth/storage schemas, database roles, external files and secret configuration. Current Nexora upload/package bytes are in the application database.

Install PostgreSQL client tools compatible with the server. Use a direct or session-pooler migration connection. TLS certificate verification is mandatory; set `BACKUP_CA_FILE` if system roots are insufficient. The client must support `sslrootcert=system`, or use an explicit CA file. Credentials are passed through child-process environment variables, never command arguments or logs.

Configure a dedicated `BACKUP_ENCRYPTION_KEY`: exactly 32 random bytes encoded as unpadded base64url. There is no default or fallback to the MFA key. Keep the key independently in protected storage. AES-256-GCM authenticates the archive and version header. Altered files and wrong keys fail before restore starts. Archives are currently limited to 256 MiB; larger databases need reviewed streaming backup tooling.

From `nexora-backend`:

```text
npm run db:backup -- C:\private-backups\nexora-2026-10-20.nexora-backup
```

Choose an existing protected parent directory outside public/source folders. Existing files are never overwritten. `0600` is requested; on Windows also restrict the directory ACL. Transfer the encrypted archive to independent protected storage.

## Restore rehearsal

Use a separate disposable Supabase project/database with an empty `public` schema. Provision required roles and compatible extensions first, including the restricted `nexora_runtime` role referenced by policies. Set `RESTORE_DATABASE_URL` explicitly. The command refuses configured application connection identities and nonempty application schemas. Never use another role/alias pointing at a live database. Prevent other writers while rehearsing.

```text
npm run db:restore -- C:\private-backups\nexora-2026-10-20.nexora-backup --confirm-empty-target
```

The archive is authenticated in memory before `pg_restore` receives it. Restore uses one transaction and stops on errors, preserving grants/policies but not original ownership. Missing roles/extensions or permission errors must be resolved without disabling RLS. There is no reset/truncate command.

Independently compare migration history and row counts; verify receipt digests, result snapshots, pending recovery, supervision history and import state. Verify two-school RLS with the restricted runtime role. Supply the separately backed-up MFA/package encryption key; encrypted records need it. Revoke restored sessions before eventual activation. Test login/MFA, package unlock and receipt retrieval in isolation. Record versions, elapsed time, failures and recovery point.

Adding this CLI does not establish live dump/restore acceptance. Crypto unit tests are separate evidence.

References: [pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html).
