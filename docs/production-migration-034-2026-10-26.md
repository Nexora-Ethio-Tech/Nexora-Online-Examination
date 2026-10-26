# Production migration 034 — 26 October 2026

Migration 034_structured_exam_content.sql was applied in one transaction to the configured Supabase production database after the user approved a local encrypted application-schema backup.

The backup covered public and platform schemas. It was authenticated, restored into a new isolated local PostgreSQL instance, and checked against the production snapshot. All table counts and the migration ledger matched. Rehearsing migration 034 left existing table row counts unchanged.

The production transaction used a migration advisory lock, bounded lock/statement timeouts, and a pending-migration allowlist restricted to 034. It added exam structure and question content/reference fields with defaults and size constraints. No existing records were deleted or reseeded. After commit, no repository migrations remained pending; all 55 application table row counts were preserved apart from the migration ledger. Existing extra ledger entries were preserved. Restricted runtime roles remained non-superuser and without RLS bypass.

The encrypted backup and its private key remain outside Git in the local production-migration-20261026-034 folder. This report contains no credentials or row data.

This migration does not configure Vercel or retire projects. Combined hosting still requires the existing owner database credential and MFA encryption key in the school backend, NEXORA_SERVICE=combined, a matching combined frontend, and live login verification. Shared login itself requires no additional migration.
