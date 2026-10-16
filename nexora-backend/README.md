# Nexora backend database setup

The NestJS backend connects directly to PostgreSQL through the existing `pg` driver. Supabase hosts this database; a Supabase project URL and publishable API key cannot run the SQL migrations.

Supabase is the database for ongoing backend development, application data and migrations. Do not start a local database or substitute a localhost connection. Database integration tests need a separate, isolated Supabase target before they can run.

## Environment

Keep private connection strings in `nexora-backend/.env`, which Git ignores. The backend reads this exact file regardless of the command's working directory. Process environment variables take precedence, allowing deployment configuration and explicitly isolated tests.

Use [.env.example](.env.example) as the list of server settings. Required database settings:

- `DATABASE_URL`: application/runtime PostgreSQL connection.
- `MIGRATION_DATABASE_URL`: privileged PostgreSQL connection for schema migrations.

In the [Supabase Connect panel](https://supabase.com/docs/guides/database/connecting-to-postgres#get-your-connection-string), copy the project's PostgreSQL connection string and fill in its database password. Percent-encode reserved password characters. Use a direct connection where reachable, or the Session pooler on port 5432 for an IPv4 connection. The persistent backend and migration scripts reject the transaction pooler on port 6543.

`DATABASE_URL` must use the restricted `nexora_runtime` role. Startup refuses superuser, RLS-bypassing, role/database-creation, schema-creation, table-owner or elevated-membership credentials. Keep the administrative connection only in `MIGRATION_DATABASE_URL`.

After migrations 006 and 007, provision a new project's runtime login once:

```bash
npm --prefix nexora-backend run db:provision-runtime
```

This generates a random password, enables the restricted login and atomically replaces `DATABASE_URL` in the ignored backend `.env` with file permissions 0600. It retains the Supabase host, database and pooler project suffix, and leaves `MIGRATION_DATABASE_URL` unchanged. It refuses to rotate an already-provisioned login. Keep this environment file backed up privately; other deployments need this runtime credential supplied through their secret configuration.

Tenant queries use transaction-local school context, cleared automatically on commit/rollback. Before authentication, lookup transactions expose only the supplied login ID or hashed session token. These contexts are server-controlled; they are not accepted from request fields. RLS no longer trusts `app.is_migration_or_admin`. The shared browser registry is intentionally global and accessible only to the backend role; student ownership checks remain in tenant-scoped enrollments. Publishable-key Data API roles have no access to these application tables.

## Commands

From the repository root:

```bash
npm --prefix nexora-backend run db:status
npm --prefix nexora-backend run migrate
npm --prefix nexora-backend run db:status
npm --prefix nexora-backend run start:dev
```

`db:status` only reads database metadata. It reports connectivity, runtime/migration role capabilities, public table names and migration history without printing connection strings or student records. Migration history is reported through the migration connection; the runtime role cannot access that ledger and reports null history fields.

`migrate` applies pending SQL files in order and records them in `schema_migrations`. It holds a transaction lock to serialize migration runners and rolls back the batch on failure. Repeating the command skips recorded migrations. Inspect the existing database before applying migrations to it.

Application startup does not run seeds or migrations automatically. `seed` explicitly inserts synthetic accounts/papers and can update seeded packages; it is not part of normal startup or migration.

`start:dev` compiles with TypeScript before starting the backend; restart it after editing source files. NestJS constructor injection requires the emitted decorator metadata, which the previous `tsx watch` command did not emit. Production uses `npm run build` followed by `npm start`; both start commands use the compiler's actual `dist/src/main.js` entry point.

## Tests

```bash
npm --prefix nexora-backend run test -- test/unit
npm run check
```

Unit tests do not write to Supabase. Existing database integration suites delete synthetic records and require an explicitly isolated database. They refuse the normal Supabase application connection. A separate Supabase test target and corresponding isolation setup must be configured before running those suites remotely.

The new restricted-runtime verification is separate from those legacy suites:

```bash
cd nexora-backend
RUN_SUPABASE_ISOLATION_TESTS=true npm run test -- test/tenant-isolation.e2e-spec.ts test/unit
```

It uses the configured Supabase runtime/migration connections, creates uniquely identified synthetic schools/accounts and removes only its own records afterward. It checks all roles in two schools, login/session/device/logout behavior, cross-school SQL denial, transaction-context cleanup, disabled legacy bypass, Data API grants, rejected DDL/role escalation and refusal to start with privileged credentials. It is opt-in because it writes temporary fixtures to Supabase. This is focused verification, not full BE-02 acceptance or authorization to run the legacy reset suites on this database.
