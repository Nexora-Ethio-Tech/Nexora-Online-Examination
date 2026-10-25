# Pending-feature implementation and acceptance

Scope authorized 24 October 2026. Local commits and isolated local databases only; no hosted Supabase changes or push. Preserve unrelated `.env.example` deletion and `docs/testing.zip`.

## Acceptance checklist

- [x] Display immutable school code in owner directory/details.
- [x] Administrator first/father/grandfather names, phone and recovery email; validated create/edit.
- [x] Private expiring administrator enrollment link, initial-credential verification, QR/key and code confirmation; protected recovery retained.
- [x] Excel roster with optional leftmost roll number and three required name columns; generated login IDs; safe repeat-import behavior.
- [x] Active schools discovered automatically by bounded worker sweeps without restart; preserve tenant processing and leases.
- [x] Assign/revoke invigilator opens reason/confirmation dialog before mutation.
- [x] Compact account-level MFA status and all authorized pending requests, optional exam filter.
- [x] Administrative assistance history with staff/student/exam, server timestamps, outcomes and totals; no codes/secrets stored.
- [x] First qualifying interruption requests staff approval, persists server pause, preserves offline evidence/deadline, deduplicates episode.
- [x] Fullscreen hover/pointer movement alone does not trigger approval; actual exit and genuine focus/visibility loss do.
- [x] Single question review card, numbered navigator, Previous/Next/Save and next, reviewed green and warnings amber; protect unsaved edits and bulk review.

## Validation completed

Frontend check/build, backend unit/build, isolated migration/HTTP integration, targeted responsive browser checks, updated all-feature manual guide. Record actual results and remaining physical Chrome/Edge checks here; a synthetic event does not prove native browser-chrome behavior.

Verified 25 October 2026: 286 frontend tests, 17 tooling tests, 218 backend unit tests, 28 local integration tests and 6 desktop/mobile browser checks passed. Builds passed. Migrations 030–033 applied to both local databases. Physical fullscreen hover and phone scanning remain manual checks.
