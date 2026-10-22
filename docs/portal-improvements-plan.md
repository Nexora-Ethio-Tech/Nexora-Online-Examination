# Portal improvements — implementation tracker

Approved 22 October 2026. Work only in this checkout, on the existing task branch. Local commits only. Preserve the unrelated deletion of `nexora-backend/.env.example`. Private credentials stay outside Git.

## Accepted requirements

1. Contextual, resumable tours anchored to navigation and controls, persistent Help entry, exploration without losing progress, accessible touch/keyboard interaction. No tour over the active student runner.
2. New student IDs append Gregorian creation year in EAT; existing IDs remain unchanged. School-wide numbering continues across classes and years, including beyond 9999.
3. Delete class wording; retain history and recovery data internally. Explain preserved exam results without exposing database details. Never imply student accounts are deleted by deleting their class.
4. Explicit grade and section structure, grade-first assignment navigation, class/subject/teacher filters and search, two-column desktop cards.
5. Grade-specific subjects shared by sections of the same grade, validated on assignment.
6. First/father/grandfather teacher names; display full names and subjects on assignment cards, omit login IDs and subject codes there. Do not guess how to split existing names.
7. One Edit student action, with profile/login editing and a separate password reset section. Never reveal current passwords.
8. Remove the duplicate Go to question reviews shortcut; keep Review imported questions.
9. Mobile question cards and full-width editing with readable inputs and navigation; retain useful desktop overview.
10. Distinguish unreviewed questions from genuine warnings; stop false positive AI flags; one confirmation for all complete questions without warnings. Keep teacher confirmation and individual resolution of real issues.
11. Grade-first admin exams, subject/teacher/submission-date filters and search across all database results, preserve status information.
12. Plain-language platform owner school/admin/access/activity workflows and a dedicated guided tour.
13. Update affected migrations, APIs, mock behavior, validation, exports, tours, tests and architecture/testing documentation throughout.
14. Screen-fitting Monday–Sunday calendar, bounded year selection, Ethiopian/Gregorian toggle preserving date, Amharic Ethiopian months, Latin digits, EAT AM/PM.
15. Automatic fresh server-time checks for scheduling with preserved inputs and clear failures; preserve server authority and deadline rules.

## Delivery slices

- Task 1: question warnings, review actions and mobile editing (8–10): implemented; automated and real integration checks passed. See question-review-usability.md. Physical-device acceptance remains separate.
- Task 2: grades, accounts and searchable directories/exams (2–7, 11): implemented. See [architecture and testing](grade-directory-architecture-and-testing.md).
- Task 3: calendar and scheduling (14–15): implemented. See [architecture and testing](calendar-scheduling-improvements.md).
- Task 4: contextual tours and owner portal (1, 12): implemented. See [architecture and testing](resumable-guides-and-owner-portal.md).

Each task targets ten meaningful local commits after relevant checks. Item 13 applies to every slice. Record actual test evidence and remaining limitations, including local database migrations and manual browser checks, rather than treating mock tests as integration evidence.

## Final verification and testing order

On 22 October 2026: frontend `npm run check` passed 233 tests plus 14 release/configuration checks; frontend build passed. Backend build and 170 unit tests passed. `node scripts/local-test.ts test` passed 20 real API/PostgreSQL checks, including migration 025, mixed old/new IDs, assignment grade validation/filtering, retained class deletion and exam submission filters. Nine selected Chromium journeys passed across desktop, 360px mobile and landscape, including accessibility checks. These use synthetic browser data; the separate API tests use isolated local PostgreSQL. Existing bundle-size warnings remain. Physical-phone and hosted acceptance are not claimed.

Test these guides in order:

1. [Grades, accounts, assignments and exam filters](grade-directory-architecture-and-testing.md).
2. [Question flags, bulk confirmation and mobile editing](question-review-usability.md).
3. [Dual calendars and automatic scheduling refresh](calendar-scheduling-improvements.md).
4. [Resumable tours and platform owner](resumable-guides-and-owner-portal.md).

Before manual testing, restart existing backend/owner/worker processes so they load the newly built code. Run each command in its own terminal from `exam-frontend`, stopping the corresponding old process first. The PostgreSQL instance may remain running; do not start a second copy.

```powershell
node scripts/local-test.ts backend
node scripts/local-test.ts platform
node scripts/local-test.ts worker
node scripts/local-test.ts frontend
```

Use local test accounts. These launchers select the persistent local manual database; automated tests select the disposable local database. Production Supabase and Vercel were not modified. Migration 025 is already present in both local test databases and remains a deployment prerequisite for other environments. Never commit private configuration or authenticator material.
