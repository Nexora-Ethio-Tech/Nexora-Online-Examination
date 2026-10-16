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

`start:dev` compiles with TypeScript before starting the backend and explicitly sets `NODE_ENV=development`; restart it after editing source files. NestJS constructor injection requires the emitted decorator metadata, which the previous `tsx watch` command did not emit. Production uses `npm run build` followed by `NODE_ENV=production npm start`; both start commands use the compiler's actual `dist/src/main.js` entry point.

## Frontend Origin and CSRF

Set `APP_ORIGIN` and optionally `CORS_ORIGIN` to individual, exact frontend origins, such as `https://exam.example`. Each value must contain only the scheme, host and optional nondefault port: no trailing slash, path, credentials, query, fragment, wildcard or comma-separated list. Production requires HTTPS. Configure the browser-visible frontend origin, including when the API is behind a same-origin proxy; the API does not derive trust from Host, forwarded headers or Referer.

Explicit development/test mode additionally permits `http://localhost:5173`, `http://127.0.0.1:5173` and `http://localhost:3000`. These defaults are absent in production. Startup rejects invalid configuration and requires at least one configured origin outside development/test.

CORS and the mutation guard share this exact allowlist. Every mutation requires its allowed `Origin` header and the current session's `X-CSRF-Token`, including login, MFA and logout. Missing/forbidden Origin, Referer-only requests and incorrect tokens return 403 `CSRF_INVALID` after the applicable session checks. A valid token does not authorize another origin. CORS rejects disallowed origins rather than matching hostname prefixes; allowed preflights support credentials without wildcard origins. Readiness and other permitted reads continue to work without an Origin header.

Focused Supabase verification creates and removes only its own synthetic school, account and sessions:

```bash
cd nexora-backend
RUN_SUPABASE_ORIGIN_TESTS=true npm run test -- test/origin-security.e2e-spec.ts test/unit
```

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

## Administrator MFA

Migration 008 retires unverified legacy/plaintext MFA secrets, disables those administrators and revokes their sessions. Student and teacher accounts retain their existing authentication flow. New synthetic seed administrators are inactive until protected enrollment; there is no default MFA secret or fallback code.

Generate the server-only encryption key once before starting the backend:

```bash
npm --prefix nexora-backend run mfa:operator -- init-key
```

The command saves a random 32-byte `MFA_ENCRYPTION_KEY` privately in backend `.env` without printing it. Back it up in the deployment secret store and use the same value on every API instance. Startup rejects missing/invalid keys. Do not regenerate it on restart: changing it makes existing enrollment secrets unreadable and requires a planned recovery process.

Operator commands require `MIGRATION_DATABASE_URL` and a private interactive terminal. Restrict host/secret access to authorized support operators. Verify the administrator using the school's established support contact before typing `VERIFIED`; the command records the operator identity, administrator and reason. Do not run through CI, terminal recording, shared screens, redirected output or application logs.

For a new school and first administrator:

```bash
npm --prefix nexora-backend run mfa:operator -- bootstrap --school-name "Example School" --school-slug example-school --login-id EXAMPLE-ADM01 --display-name "Example Administrator" --operator "support-operator-id" --reason "Verified initial provisioning"
```

This creates the school and inactive administrator atomically with a generated password. The initial password and authenticator secret/URI appear only in the private terminal. Deliver the password privately to the verified administrator, have them add the authenticator through that private session and enter their six-digit code when prompted. Nothing activates until that code verifies. If confirmation fails, the account remains inactive. Do not place enrollment material or passwords in Git, chat, tickets or implementation reports.

For an existing inactive administrator (including a legacy seed account):

```bash
npm --prefix nexora-backend run mfa:operator -- enroll --school-id SCHOOL_UUID --admin-id ADMIN_UUID --operator "support-operator-id" --reason "Verified administrator enrollment"
```

For lost-authenticator recovery, use the same command with `recover` instead of `enroll`, after verifying the support contact. Recovery immediately disables the account, retires the old secret and revokes all existing auth/challenge sessions. A fresh secret must be confirmed before reactivation. `enroll` refuses to replace a verified enrollment implicitly.

Enrollment expires after five minutes and locks after five bad confirmation attempts. If a pending enrollment is still valid, rerun with `confirm` to enter a code without displaying the secret again; supply the same school/admin/operator/reason flags. Otherwise restart enrollment/recovery through the verified operator procedure. A code used to confirm enrollment is consumed: wait for a fresh 30-second code before the first login.

Web verification uses six digits, HMAC-SHA1, 30-second steps and at most one adjacent step in each direction, following [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238). Secrets use AES-256-GCM bound to school/admin/enrollment version. Five failed attempts per account within five minutes apply across all challenges and API restarts; subsequent verification returns 429 `RATE_LIMITED` with `Retry-After`. Challenge expiry is five minutes, checked after database locks. Code consumption, challenge revocation, verified-session creation and audit commit together. The existing login/MFA JSON contract is unchanged.

Focused Supabase verification (temporary, explicitly scoped synthetic records only):

```bash
cd nexora-backend
RUN_SUPABASE_MFA_TESTS=true RUN_SUPABASE_ISOLATION_TESTS=true npm run test -- test/admin-mfa.e2e-spec.ts test/tenant-isolation.e2e-spec.ts test/unit
```

The legacy seed-based recovery suite's fixed-secret setup is historical and must be ported to protected synthetic enrollment with the rest of those guarded suites before remote execution. It was not run against this application database.
