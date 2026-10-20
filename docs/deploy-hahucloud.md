# HahuCloud: future deployment option

Vercel remains the current target. This is a preflight checklist, not evidence that a HahuCloud account has been inspected.

Confirm supported Node LTS versions, native Argon2 compatibility, process lifetime, startup/restart mechanism, PostgreSQL TLS connectivity, connection limits, worker/cron support, upload limits, reverse-proxy support and resource limits. Do not assume Passenger or `.htaccess` proxy directives are available.

Build both applications with committed lockfiles and the verified runtime. Serve frontend `dist` with explicit client-route fallback. Keep API source, environments and private files outside the public web directory. The compiled API entry is `nexora-backend/dist/src/main.js`; adapt it to the actual supported startup mechanism.

Prefer same-origin `/api/v1` routing when supported. Otherwise verify exact CORS/origin allowlists and secure cookies. Separate restricted runtime credentials from migration credentials and enable TLS certificate verification.

Use a supervised persistent multi-school worker only if the host supports it. Otherwise configure an authenticated scheduler following sweep cursors within request-duration limits. Record restart/retry behavior.

Before migration, rehearse independent backup/restore, assess migration/rollback compatibility, test login/MFA through a real exam receipt and results/practice, and measure actual device and concurrency behavior. Do not move active sittings or force service-worker updates with pending work.

Retain the tested Vercel artifact and record database rollback limits. DNS changes or HahuCloud deployment require a separate owner-directed hosting migration.
