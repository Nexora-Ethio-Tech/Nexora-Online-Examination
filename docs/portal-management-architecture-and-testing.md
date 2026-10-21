# Portal management implementation plan and acceptance

Requested scope: removal controls, bulk question review, stuck-import cancellation, class-grouped accounts, school-wide student IDs, and versioned onboarding. AI keys and upload-format architecture are the next phase, not part of this change.

## Decisions

- Retain exam evidence when removing school records. Confirmation and reasons are required. Do not cascade-delete accounts, classes or subjects with academic history.
- Individual review remains available; one explicit confirmation can review all structurally valid questions with complete topics/explanations and resolved flags. Bulk review is not automatic acceptance of invalid content.
- Cancellation invalidates import/AI leases and detaches the latest import. Keep previously parsed questions unless the teacher separately removes the draft. A worker already calling a provider may finish externally, but cannot commit late output.
- Account browsing starts with class cards and uses server-side class filtering, including pagination/search scoped to that class.
- New student IDs use the school's stable slug as prefix and one atomic counter across its classes. Existing IDs remain valid. Minimum four digits, no reuse/reset after deletion, no wrap after 9999.
- Role-specific guided tours are versioned in source and can be reopened. New versions appear once per account/browser; no popup during an active exam.

## Verification plan

Run frontend check/build, backend unit/build and targeted browser journeys. Add coverage for ownership/revision/replay, cancellation versus late worker results, bulk-review validation, class-bound pagination, numbering continuity and tour persistence. Real migration/RLS/concurrency acceptance needs an isolated staging database; migration 024 must not be applied to production by this task.

## 1. Delete unused records; archive retained records

School setup now provides removal controls for classes, subjects, students, teachers and teacher assignments. A reason and explicit confirmation are required. The server checks role, tenant, revision and replay identity, locks the target, and inspects incoming database foreign keys before choosing delete or archive. Retained accounts become inactive and lose login sessions. Current enrollment and login sessions alone do not count as historical account evidence. Errors checking dependencies fail closed. Assignments used by existing exams reject removal, preserving the existing assignment-edit restriction; exams link to them through teacher/class/subject rather than an assignment foreign key.

Teachers can remove editable drafts; empty drafts can be deleted, while referenced drafts are archived with import leases cancelled. Approved papers and official results are not deletable through this feature. Archived drafts are excluded from teacher and administration authoring lists. This is not an unrestricted delete-everything API; platform owners and school administrators retain their separate management workflows.

Test: create an unused class and remove it with a reason; verify it disappears. Repeat with a class/account referenced by exam evidence and verify the response says archived, history remains, and account login is denied. Retry the same request, try a stale revision, and try another school's ID: no duplicate mutation or cross-school access should occur. Check effects on existing assignments before archiving an active class.

## 2. Bulk question review

The teacher review screen has one confirmation and a bulk-review button. The backend validates each question, reviews only eligible items, records the reviewing teacher/time, snapshots the previous revision and audits the count. Missing content and unresolved answer-key conflicts remain unreviewed. Individual review remains available; submission still requires valid reviewed content.

Test: upload a paper with one complete question and one unresolved flag. Bulk review should review the complete question only and keep submission blocked. Resolve the remaining issue, review again, and verify submission becomes available. Changing the draft revision resets the bulk confirmation.

## 3. Cancel a queued or stuck import

The teacher can remove/cancel the current import with a reason. The cancellation transaction detaches the import, clears uploaded source bytes and generation requests, invalidates parser/AI leases and terminates pending AI jobs. Worker completion checks reject stale results. Already parsed questions remain; removing the entire editable draft is a separate action. An external provider request already in flight may finish externally.

Test: upload and immediately cancel while queued. Verify the busy state clears, another upload is allowed, and the cancelled worker cannot later replace questions. Repeat during parsing and AI processing in staging. Previously reviewed questions must remain intact.

## 4. Accounts grouped by class

Accounts opens with class cards showing class names and student counts, plus an unassigned group. Selecting a card opens that class's accounts. Filtering, search and pagination are scoped on the server; cursor identity includes the class filter. Closing a temporary credentials screen preserves the selected class. Teacher management remains separate.

Test: import students into two classes, open each card and search/paginate. Each group must contain only its students. Open and close credentials, and verify the selected class remains. Test unassigned students and class-filter changes while a previous request is pending.

## 5. School-wide student IDs

New IDs use the stable school slug, for example NEXORA-STU-0001. One transactional counter per school reserves the entire roster batch under the existing directory lock. Existing numeric student suffixes seed the high-water mark; existing login IDs are not renamed. Deletion does not recycle IDs. Padding is a minimum of four digits, so 9999 advances to 10000. The stored integer counter has a checked capacity limit.

Test: with the school's largest existing suffix 1000, import into two different classes. Expect sequential IDs beginning at 1001. Delete an unused student and import again: its number must not be reused. Test 9999 to 10000, concurrent imports, rollback after failed import, and a separate school's independent counter. Concurrency/rollback need real PostgreSQL acceptance, not only mocks.

## 6. Maintainable onboarding

The centralized role-specific manifest is `src/features/onboarding/guide.ts`. A first-visit popup describes the portal, offers links and can be closed or reopened using Portal guide. Its content revision is stored per school/account/role in browser preferences; changed guidance is offered again. Blocked storage cannot block access. Short viewports can scroll the guide. The active student exam runner never shows it. AGENTS.md requires future feature changes to update this manifest and the testing documentation.

Test: log in as each role in a fresh browser, close/reopen the guide, reload and verify dismissal persists. Change the manifest and verify updated guidance appears. Check keyboard navigation, mobile portrait/landscape and blocked localStorage. Enter an active exam and verify no guide appears.

## API and database rollout

Added POST endpoints: `/directory/:kind/:id/remove`, `/exams/:id/review-all`, `/exams/:id/remove`, and `/imports/:id/cancel`. Existing authenticated cookie/CSRF and role guards remain authoritative. Frontend API schemas and backend controllers are the executable request definitions.

Migration `024_portal_management.sql` adds the tenant-isolated `school_student_counters` table and `exams.archived_at`. It has **not been applied**. Reconcile the target migration ledger first, including the known 020/021 history discrepancy, and test the full migration chain on a disposable database. Coordinate backend/frontend rollout after schema validation. No push, deployment or production data mutation was performed.

## Verification evidence

- Frontend `npm run check`: strict typecheck, lint, formatting, 216 tests and 9 release-source checks passed.
- Frontend production build passed; existing large-chunk advisory remains.
- Backend unit suite: 155 tests passed; TypeScript build passed.
- Targeted Playwright/axe journeys: 6 passed across desktop, mobile portrait and mobile landscape. They cover class cards, unused removal, onboarding, import cancellation, bulk review and draft removal against the demo transport.
- Full backend `npm test` did not pass: four PostgreSQL suites rejected the configured database because it was not the required disposable localhost database; 133 tests were skipped. No guard was bypassed.

These checks establish local implementation and synthetic regression coverage. Real SQL migration/grants/RLS, concurrent transaction races, real API cookies and provider cancellation still require isolated database acceptance. Do not treat demo behavior as production certification.
