# Nexora backend database setup

The NestJS backend connects directly to PostgreSQL through the existing `pg` driver. Supabase hosts this database; a Supabase project URL and publishable API key cannot run the SQL migrations.

Supabase is the database for ongoing backend development, application data and migrations. Do not start a local database or substitute a localhost connection. Database integration tests need a separate, isolated Supabase target before they can run.

## Environment

Keep private connection strings in `nexora-backend/.env`, which Git ignores. The backend reads this exact file regardless of the command's working directory. Process environment variables take precedence, allowing deployment configuration and explicitly isolated tests.

Use [.env.example](.env.example) as the list of server settings. Required database settings:

- `DATABASE_URL`: application/runtime PostgreSQL connection.
- `MIGRATION_DATABASE_URL`: privileged PostgreSQL connection for schema migrations.

In the [Supabase Connect panel](https://supabase.com/docs/guides/database/connecting-to-postgres#get-your-connection-string), copy the project's PostgreSQL connection string and fill in its database password. Percent-encode reserved password characters. Use a direct connection where reachable, or the Session pooler on port 5432 for an IPv4 connection. The persistent backend and migration scripts reject the transaction pooler on port 6543.

Use a restricted runtime database role for deployment. Configuring a privileged migration connection does not establish runtime RLS isolation; that remains part of the documented backend prerequisites.

## Commands

From the repository root:

```bash
npm --prefix nexora-backend run db:status
npm --prefix nexora-backend run migrate
npm --prefix nexora-backend run db:status
npm --prefix nexora-backend run start:dev
```

`db:status` only reads database metadata. It reports connectivity, runtime/migration role capabilities, public table names and migration history without printing connection strings or student records.

`migrate` applies pending SQL files in order and records them in `schema_migrations`. It holds a transaction lock to serialize migration runners and rolls back the batch on failure. Repeating the command skips recorded migrations. Inspect the existing database before applying migrations to it.

Application startup does not run seeds or migrations automatically. `seed` explicitly inserts synthetic accounts/papers and can update seeded packages; it is not part of normal startup or migration.

`start:dev` compiles with TypeScript before starting the backend; restart it after editing source files. NestJS constructor injection requires the emitted decorator metadata, which the previous `tsx watch` command did not emit. Production uses `npm run build` followed by `npm start`; both start commands use the compiler's actual `dist/src/main.js` entry point.

## Tests

```bash
npm --prefix nexora-backend run test -- test/unit
npm run check
```

Unit tests do not write to Supabase. Existing database integration suites delete synthetic records and require an explicitly isolated database. They refuse the normal Supabase application connection. A separate Supabase test target and corresponding isolation setup must be configured before running those suites remotely.
