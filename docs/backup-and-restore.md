# Independent application backup and restore

The CLI uses PostgreSQL custom-format archives for the `public` and `platform` application schemas: application tables, sequences, functions and policies, including owner accounts and audits after migration 023. It does not maintain a fixed table list or silently skip conflicting rows. It excludes Supabase-managed auth/storage schemas, database roles, external files and secret configuration. Current Nexora upload/package bytes are in the application database.

Install PostgreSQL client tools compatible with the server. Use a direct or session-pooler migration connection. TLS certificate verification is mandatory; set `BACKUP_CA_FILE` if system roots are insufficient. The client must support `sslrootcert=system`, or use an explicit CA file. Credentials are passed through child-process environment variables, never command arguments or logs.

Configure a dedicated `BACKUP_ENCRYPTION_KEY`: exactly 32 random bytes encoded as unpadded base64url. There is no default or fallback to the MFA key. Keep the key independently in protected storage. AES-256-GCM authenticates the archive and version header. Altered files and wrong keys fail before restore starts. Archives are currently limited to 256 MiB; larger databases need reviewed streaming backup tooling.

From `nexora-backend`:

```text
npm run db:backup -- C:\private-backups\nexora-2026-10-20.nexora-backup
```

Choose an existing protected parent directory outside public/source folders. Existing files are never overwritten. `0600` is requested; on Windows also restrict the directory ACL. Transfer the encrypted archive to independent protected storage.

## Restore rehearsal

Use a separate disposable Supabase project/database with an empty `public` schema and no existing `platform` schema. Provision required roles and compatible extensions first, including `nexora_runtime`, `nexora_platform` and the no-login `nexora_platform_ops` role referenced by policies/functions. Set `RESTORE_DATABASE_URL` explicitly. The command refuses configured application connection identities and nonempty application schemas. Never use another role/alias pointing at a live database. Prevent other writers while rehearsing.

```text
npm run db:restore -- C:\private-backups\nexora-2026-10-20.nexora-backup --confirm-empty-target
```

The archive is authenticated in memory before `pg_restore` receives it. Restore uses one transaction and stops on errors, preserving grants/policies but not original ownership. Missing roles/extensions or permission errors must be resolved without disabling RLS. There is no reset/truncate command.

Independently compare migration history and row counts; verify receipt digests, result snapshots, pending recovery, supervision history, import state and platform audits. Verify two-school RLS with the restricted runtime role and platform-column/function permissions with the platform role. Supply the separately backed-up school MFA/package keys and `PLATFORM_MFA_ENCRYPTION_KEY`; encrypted records need them. Revoke restored school and platform sessions before eventual activation. Since restore omits ownership, explicitly restore the four platform operation functions to `nexora_platform_ops` using the signatures in migration 023 and verify its restricted grants before enabling the portal. Test both logins/MFA, package unlock and receipt retrieval in isolation. Record versions, elapsed time, failures and recovery point.

Adding this CLI does not establish live dump/restore acceptance. Crypto unit tests are separate evidence.

References: [pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html).
