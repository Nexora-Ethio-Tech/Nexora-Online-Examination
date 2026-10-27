# Grades, accounts and filters

## Changes

Classes have explicit Grade and Section fields. New names are composed as `Grade 9 A`. Subjects belong to a grade and can be shared across its sections. Existing records remain unclassified until edited; names are never guessed or split automatically. Remove active assignments before changing an existing grade, classify both sides, then reactivate compatible assignments.

Assignments show teacher full names, class and subject, with two columns on wider screens. Grade buttons reveal class buttons. Search and grade/class/subject/teacher filters run on the backend before pagination. Directory options load subsequent pages automatically. Admin exam cards group by grade and support name, teacher, subject and actual submission-time filters. A legacy paper without a submission event does not match a submission date range.

Teacher creation asks for First name, Father's name and Grandfather's name. Student Edit includes name, login ID, class, active status and password reset. Changing a login ID revokes existing sessions. Reset is unavailable while profile changes are unsaved; current passwords are never returned.

New student IDs use `SCHOOL-STU-0001-2026`, with the Gregorian creation year in EAT. Existing IDs stay unchanged. The school-wide counter continues across classes and years, recognizes old and new ID formats, never recycles allocated numbers and continues past 9999.

Delete class removes it from active directory and assignment lists, retaining its record for recovery and past exams. It does not delete student accounts or frozen exam results. Other records retain the existing unused-delete/history-retention policy.

## Architecture

Migration `025_grade_directory.sql` adds nullable grade/section and teacher name columns. Tenant RLS remains in force. Directory writes use the existing school advisory lock, revision checks, audit and idempotency mechanism. Assignment creation/reactivation requires equal class and subject grades. Legacy null/null pairs remain supported. Changed grade filters are included in cursor scope; assignment pagination uses assignment IDs.

Migration 025 was applied to the manual and disposable local PostgreSQL databases, not production. A deployment needs the migration before the new backend. Never run the local launcher against a hosted database.

## Test in order

1. As school administrator, open School setup → Classes. Create Grade 9, Section A, then Section B. Create a Grade 9 Physics subject and a separate Grade 10 Physics subject.
2. Create a teacher with all three name fields. In Assignments, choose Grade 9 A: only Grade 9 subjects should be offered. Assign Physics, then verify grade/class/teacher/subject filters and combined search. Clear filters to return to all records. Load a second page if available.
3. Import students into both classes. Check the year suffix and a continuous sequence. Existing IDs must not change. In Accounts → class → Edit, change a name/ID, save, then reopen Edit → Password to reset. Old login sessions must no longer work after an ID change or reset.
4. Use the small trash icon on a temporary class. Verify the warning names the class and explains retained accounts and exam records. The Delete class button requires both a reason and the acknowledgement checkbox. Keep class cancels; reopening clears the reason and acknowledgement. Confirm deletion. It disappears from active lists; accounts and previous results remain. Do not use a class containing a live test sitting for this check.
5. Submit papers from different grades/teachers. In Exam approvals and schedules, verify each filter separately and together, including Submitted from/until in EAT.

Automated evidence: real local integration includes grade mismatch rejection, assignment filtering and retained class deletion. Number allocation concurrency, rollback, rollover and tenant isolation run against PostgreSQL. Frontend tests cover revised creation and editing workflows. Physical mobile acceptance remains a separate check.

## Consistent removal controls

Classes, subjects, student/staff accounts and teaching assignments use small accessible trash icons. Each opens a warning naming the record and explaining retained exam history. A reason and acknowledgement are required; cancelling and reopening clears both. Teacher draft removal keeps its warning and acknowledgement, with an optional note; import cancellation uses an icon with its warning and optional note. API removal rules are unchanged.

## Reason and note policy (26 October 2026)

Routine creation has no reason field: classes, subjects, teacher/invigilator accounts, roster imports, initial student login details and teaching assignments. Editing class/subject or ordinary account details has **Note (optional)**. Account activation/deactivation, password resets and directory deletions still require a reason. Deletion warnings and acknowledgements remain mandatory. Audits retain the actor, action, resource and time even when no note is supplied; blank notes are not replaced with invented explanations.

Elsewhere, approval comments, schedule changes, AI settings, practice settings, teacher draft removal, import cancellation and student recovery uploads accept optional notes. Returning a paper, resolving flagged questions, extra-time changes, device replacement, supervision decisions, rejection of reopening and recovery review decisions require explanations. Student recovery retry preserves its original frozen request and note, including an empty note.

Invigilator assignment reads now return `reasonRequired`, calculated from authoritative exam start and server time. Before start there is no reason input; at/after start a reason is required. The backend checks this again on writes. The visible directory refresh brings the UI up to date; a request crossing the start boundary can be rejected with an explanation to refresh and supply a reason.

Platform owner provisioning, adding administrators, editing administrator information and inspecting the administrator directory require no reason. Subscription notes are optional. School suspension/reactivation and administrator recovery retain mandatory reasons and authenticator verification. Reading administrator details continues to produce an audit event.

Verification: create/import/issue credentials with no reason; save ordinary edits with blank notes; confirm that active-status changes, deletion and password reset remain blocked without a reason. Approve a paper without a note, then separately confirm returning requires corrections. Check invigilator assignment both before start and exactly at start. Optional notes must accept blank input and preserve entered notes in history. Backend unit tests and frontend/demo tests support this policy; database integration and production rollout require separate evidence.
