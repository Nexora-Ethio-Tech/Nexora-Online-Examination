# Organized exam portals: architecture and testing

Current local status: see [24 October alignment and test results](local-release-readiness.md). Historical limitations below refer to the earlier run.

Implemented locally on 24 October 2026. No deployment or production database changes.

## Behavior

| Portal | Views | Ordering |
| --- | --- | --- |
| Student | Current, Needs attention, Upcoming, Past; All remains available | Case-insensitive title order, then sitting ID |
| Teacher | Active & upcoming, Past papers; active status filters | Creation time descending, then paper ID |
| School admin | Pending approval, Approved & scheduled, Returned | Pending: latest submission time ascending; other views: creation time descending |

Student uploads awaiting confirmation and recovery cases remain in Needs attention. Recorded submissions and invalidated attempts are Past. An ended attempt without a confirmed submission also needs attention. Past results filters remain available; these filter loaded exam cards, with a notice when additional pages remain. Category filtering itself occurs before server pagination.

Teacher drafts, returned papers, pending approvals and approved papers without a sitting remain active. An approved paper becomes Past only when every sitting's end plus maximum roster extra time and the existing five-second submission allowance has elapsed. This does not mean results are published or recovery is resolved. Existing teacher ownership and edit permissions still apply. Archived papers and inactive assignments retain their existing visibility restrictions.

The pending approval queue uses the latest `exam:submit` audit timestamp. Resubmission rejoins the queue at its new submission time. Missing timestamps sort last and display as unavailable; no invented creation date is presented as submission time.

Admin filters use stored grade and class IDs. Changing grade resets class selection. Search matches paper title, class name, teacher name, subject name and subject code; teacher, subject and submission date filters remain available. Search is debounced. Grade sections show loaded matches rather than an invented school-wide count.

Cards use one column on phones, two at medium widths and three at 1536px and above, leaving room for the sidebar and long titles. Current/approved uses the existing green, upcoming blue, attention/pending amber, past/drafts muted, and returned red. Text labels accompany color; there is no pulse animation. Onboarding explains the new views.

## API and implementation

- `GET /me/exams`: additive `category=all|current|attention|upcoming|past`, `sort=start|title`. Legacy defaults remain all/start; the portal requests title order. Title cursors include title plus sitting ID and are bound to school, student, category and sort.
- `GET /exams`: additive `category=all|active|past` and optional draft/returned/in_review/approved status. List entries include creation time and concluded state. Cursors bind the filters as well as teacher and school.
- `GET /admin/exams`: additive status and classId filters. Submission ordering and search run in PostgreSQL before LIMIT. Cursor scope includes all filters. The internal sort fallback is not exposed as a real timestamp.
- Old cursors from a previous release should be discarded by refreshing the list. No schema migration is introduced by this feature.
- PostgreSQL collation determines ordering of mixed-language titles; this is case-insensitive lexical ordering, not natural-number sorting. Demo sorting may differ for mixed scripts. Verify the target database's collation before promising a specific Amharic ordering.
- Demo handlers mirror categories and pagination, but cannot establish SQL correctness, RLS isolation or concurrency guarantees.

## Test in this order

1. **Student → My exams.** Check Current, Upcoming, Past and Needs attention. A pending upload must not look submitted. Submit an exam early and confirm it appears in Past, while its grade remains unavailable until authorized release. Exercise Past grade filters and switch back from an empty category.
2. **Student pagination.** Assign more than 25 exams with unsorted and duplicate titles. Check A–Z across Load more with no duplicate/missing sitting. Repeat with a category selected. Verify extra-time students remain current until their own deadlines.
3. **Teacher → Exam papers.** Check newest-created-first; filter Draft, Returned, Pending approval and Approved. An approved unscheduled paper stays active. For multiple sittings, confirm Past only after the final extra-time deadline and allowance. Verify approved papers remain read-only.
4. **Admin → Exam approvals and schedules.** Submit papers in a different order from creation. Pending approval must show the oldest submission first. Return/resubmit one: it should move behind older pending papers. Check more than 25 records, including identical timestamps.
5. **Admin filters.** Select a grade then a class, change grade and confirm class resets. Search title, teacher, subject and subject code. Combine status, teacher and submission dates; Clear filters must remove grade/class/search/date restrictions. An empty result must retain usable filters.
6. **Layout and guide.** At 360px, 800px and a wide desktop, check readable cards, keyboard focus, wrapping and no horizontal page scroll. Reopen the guide in each role and confirm it describes the new views.

Use the same steps against a separate local database for acceptance. Demo tests are useful for UI rehearsal only. Do not use production credentials or the hosted production database for fixture creation.

## Verification record

- Backend TypeScript build passed; 211 unit tests passed, including cursor identity/filter isolation.
- Frontend production build passed (existing dependency annotation and bundle-size warnings remain).
- New regression tests cover 30-paper pagination, teacher newest-first ordering, approved-unscheduled classification and latest-resubmission FIFO.
- Frontend typecheck, lint and formatting passed; 272 Vitest tests and 14 tooling tests passed. Four Chromium demo journeys passed across desktop and 360px mobile: student login/routes and teacher import through admin approval, scheduling and accommodations. These are synthetic journeys, not real API acceptance.
- Local PostgreSQL readiness check: `127.0.0.1:55432 - no response`. Real SQL execution, timing boundaries, RLS and multi-user races remain unverified. Prior migrations 024–027 still require isolated database validation before deployment.
