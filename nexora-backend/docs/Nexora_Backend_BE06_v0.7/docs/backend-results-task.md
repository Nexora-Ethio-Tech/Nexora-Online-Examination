# BE-05: official results, publication and reports

Issued 14 October 2026 under API contract v0.6. Implement these requirements. This is an instruction from the project owner, not a request to choose or approve an interface. Master plan v3.0 sections 6, 9.3, 10 and 12 govern the behavior. BE-02, BE-03 and BE-04 remain mandatory and unchanged. No real backend implementation has been inspected.

## What to do with this package

1. Read this file first, then api-contract.md and the included results schemas.ts and api.ts. The schemas define the exact required response properties, nullability and enums. Do not copy development mocks into the backend.
2. Implement deterministic official grading and versioned result snapshots in the database, connected to the exact BE-02 final submission/recovery transaction and BE-04 frozen paper/roster.
3. Implement all endpoints below, school/assignment restrictions, publication gates, complete CSV exports and the report payload. Preserve student receipt payloads: never add unreleased marks.
4. Run the required real-database tests and connect the frontend. Return the report at the end of this file. Report any concrete blocker with evidence and continue unaffected work; do not substitute another interface.

## A. Grading and result identity

Use the frozen teacher-approved version for each sitting. Compare canonical option IDs, awarding the full positive integer item mark for a match and zero for wrong/null answers. No negative or partial marks. The exact accepted complete snapshot, score, digest and receipt commit in one transaction. Interim saves are never an official result. Practice data never enters official calculations.

One results revision identifies the entire sitting/class snapshot: roster status rows, valid totals, ranks and aggregates. Start at 1 and increment when source submissions, decisions, invalidations, grading or relevant roster/schedule data changes. Reads do not create attempts or academic state. Preserve immutable previously approved snapshots. Persist source exam version, submission/recovery ID and result revision so a report can be reproduced. A later accepted recovery creates a new candidate revision and requires another administrator approval; never silently replace or automatically release the older revision. All data/rank/analytics/export reads for a given revision must agree.

`finalized` means a valid committed official result. `absent` means no attempt recorded; before the exam closes the frontend labels this “No attempt recorded.” `awaiting_upload` means an attempt exists without an accepted final result, including preparing/active attempts before closure. `recovery_pending` is unresolved retained recovery evidence. `invalidated` is an audited invalid attempt. `excluded` is a row explicitly excluded from the requested publication. For every non-finalized status, score, percent, rank and passed are null, not zero. maxScore remains the approved paper total. attemptId is null only where no attempt exists. exclusionReason is null except for an explicitly excluded row.

Rank finalized valid totals within the same sitting and class using competition ranking: one plus the number of strictly higher totals. Equal totals tie (1, 2, 2, 4); do not rank by rounded percentages or use student IDs to break academic ties. Preserve a stable secondary display order by login ID/student ID. Percent is 100 × score / maxScore, unrounded in JSON; the frontend displays one decimal. Pass uses the unrounded percentage and the approved pass threshold.

## B. Endpoints and payloads

All paths have /api/v1 prefix. Session-derived school and role, HttpOnly cookies, CSRF for mutation, private/no-store responses, direct JSON success bodies and standard error objects apply. Reject unknown/inaccessible IDs without leaking another school's records. Students cannot call any staff reporting or export endpoint. Teacher access is restricted by current verified class AND subject assignments, including historical revision downloads; authorship alone does not grant school-wide access. Administrator MFA must already be complete.

| Endpoint                                         | Required behavior                                                                                                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET /results/sessions?limit=25&cursor=...        | Admin: all school sittings; teacher: only assigned class/subject sittings. Returns sessionsSchema. Stable order by endsAt then sessionId; opaque scope-bound cursor.                                                                       |
| GET /sessions/:id/results?limit=25&cursor=...    | Staff only. Current candidate summary and paginated roster rows; resultsSchema. Cursor pins the revision; if current changes during pagination return 409 REVISION_CONFLICT and require restart.                                           |
| GET /sessions/:id/analytics?revision=N           | Staff only. Whole authorized snapshot aggregates, never only the current roster page; analyticsSchema. Exact requested revision, including historical revisions.                                                                           |
| POST /sessions/:id/results-publication           | Admin only, CSRF and UUID Idempotency-Key. publishSchema body, summarySchema response. See section C.                                                                                                                                      |
| GET /me/results?limit=25&cursor=...              | Student only, own frozen-roster sittings. myResultsSchema. See section D.                                                                                                                                                                  |
| GET /exports/results.csv?sessionId=ID&revision=N | Staff only. Entire requested authorized sitting revision, all rows regardless of page. Actual UTF-8 CSV, not a JSON wrapper.                                                                                                               |
| GET /exports/results.csv                         | Admin: every school sitting; teacher: every assigned class/subject sitting. Current candidate revision per sitting, all rows. Snapshot consistently at export start. Never silently truncate to one page.                                  |
| GET /exports/report?sessionId=ID&revision=N      | Staff only. reportSchema JSON containing full authorized roster snapshot and aggregates. This is the explicit unpaginated report endpoint. The frontend renders printable HTML from typed fields; do not return arbitrary executable HTML. |

Common list limit 1–100, default 25. `{ items, nextCursor, serverNow }`; nextCursor null at the end. The results detail uses `{ summary, rows, nextCursor, serverNow }`. Invalid cursors/filters: 422 VALIDATION_ERROR. IDs/revisions outside authorized scope: 404 NOT_FOUND. Wrong role: 403 FORBIDDEN. Use query strings exactly as api.ts sends them. Export with sessionId requires revision; revision without sessionId is invalid. Reports must not include keys, answer snapshots, explanations or private review notes.

summarySchema fields:

- sessionId, title, className, subjectName: required strings.
- endsAt: common end. publishableAfter: maximum of ALL frozen-roster students' finalAcceptUntil, including accommodations and the five-second acceptance allowance, even where no attempt was created.
- plannedReleaseAt: scheduled BE-04 result date. revision: positive current candidate number.
- publication: null or `{ revision, approvedAt, approvedBy, releaseAt, reason, exclusions: [{ attemptId, reason }] }`. This is the latest approved publication; it may describe an older revision than the current candidate. approvedBy is the display name; persist the actor ID in audit storage separately.

reportSchema: `{ summary, rows, analytics, serverNow }`. The summary's revision is the requested report revision, not the latest candidate. An approved historical report retains its own approval metadata. `rows` follow resultRowSchema: studentId, studentName, loginId, attemptId, status, score, maxScore, percent, rank, passed, exclusionReason. Properties explicitly nullable must be present as null, not omitted.

analyticsSchema: `{ revision, includedCount, statusCount, distribution, topics }`:

- includedCount: finalized valid ranked students. statusCount: all other roster rows.
- distribution: five ordered `{ label, count }` bins: `0–19%`, `20–39%`, `40–59%`, `60–79%`, `80–100%`. Exact intervals are [0,20), [20,40), [40,60), [60,80), [80,100]; bin by unrounded percentage. Counts sum to includedCount.
- topics: one per approved primary topic, `{ topic, itemCount, studentCount, earnedMarks, availableMarks, percent }`. studentCount equals includedCount. availableMarks equals includedCount × sum of approved marks on that primary topic's items, including unanswered items. earnedMarks sums those item marks over valid included official results. Secondary topics never duplicate items. Percent null when denominator is zero, otherwise 100 × earnedMarks / availableMarks. Show approved topics even when includedCount is zero.

## C. Publication transaction and recovery gates

Example body:

```json
{
  "revision": 3,
  "releaseAt": "2026-10-17T11:00:00.000Z",
  "reason": "Reviewed official marks and the retained upload case.",
  "exclusions": [
    { "attemptId": "attempt-id", "reason": "Device evidence is still under investigation." }
  ]
}
```

Lock the sitting publication/revision state together with affected result/recovery state. Require current candidate revision to equal request.revision. Publication cannot be approved until serverNow is strictly AFTER publishableAfter; ordinary final submissions are valid through that boundary, so publication must not race them. releaseAt must be at or after publishableAfter. A date earlier than now is allowed for immediate release once approval is saved and all gates are met. Approval at a future date does not itself expose marks early.

Require a trimmed, nonempty reason, at most 2000 characters. Every unresolved attempt (`awaiting_upload` or `recovery_pending`) must either be decided before this transaction or appear exactly once in exclusions with a nonempty reason (same length limit). Reject missing, duplicate, unknown, finalized, absent or invalidated attempt exclusions. Multiple recovery uploads for one attempt are covered by that attempt's exclusion; decisions still follow BE-02's atomic settlement rules. Exclusion is ONLY a publication decision: it must not reject, delete or manufacture a receipt for retained evidence.

Freeze the publication snapshot with excluded status rows and null marks/ranks. Persist actor, reason, timestamps, source revision and exclusions atomically. An approved revision cannot be overwritten or rescheduled by a new key. Same actor/operation/key/canonical body returns the original success after reauthentication, even after release/restart; changed reuse returns 409 REVISION_CONFLICT. Stale revisions and already-approved revisions also return 409 REVISION_CONFLICT. Unsettled recovery without valid exclusions returns 409 RECOVERY_REQUIRED. Open submission windows or an early release date return 409 RESULTS_NOT_RELEASED. Invalid shapes/reasons return 422 VALIDATION_ERROR.

If a final submission, recovery upload, recovery decision or invalidation races publication, transactional locking must either include it in the reviewed revision or fail stale approval. Never approve a snapshot whose unresolved evidence was omitted. Regrading/corrections produce a new candidate revision; this endpoint does not edit an existing approved revision. This increment does not add the separate recovery decision screen; the existing BE-02 decision endpoint remains mandatory.

## D. Student release and privacy

Each myResultsSchema item is `{ sessionId, title, className, plannedReleaseAt, publicationRevision, result, bestPracticePercent }`.

Until BOTH administrator approval and releaseAt <= current server time are true, publicationRevision and result are null. Do not embed hidden scores, ranks, pass/fail, analytic aggregates or answer keys elsewhere in the response. The frontend must not be relied upon to hide a private payload. plannedReleaseAt reflects the latest approval's release time if one exists, otherwise the schedule's planned date; label it planned because it does not authorize release.

When released, result contains only this student's `{ status, score, maxScore, percent, rank, passed, exclusionReason }` for the highest approved revision whose release time has arrived. Never return other students' identities or rows. If a later candidate is pending approval, or a later approved revision is not due, retain the previously released immutable revision. A pending/excluded/absent/invalidated status is never represented as zero marks. No student's individual row is synthesized from interim answers.

bestPracticePercent is nullable and separate. Return null until there is an authorized valid completed practice summary; do not invent a score. The practice runner/access increment is not implemented by this package. Publication never enables practice automatically.

## E. Exports and print report

Return CSV with `Content-Type: text/csv; charset=utf-8`, private/no-store and a safe Content-Disposition attachment filename. Exact ordered headers: Exam, Class, Session, Revision, Publication, User ID, Student, Status, Mark, Maximum, Percent, Rank, Exclusion reason. Use blank CSV cells for null values. Include status/excluded rows and revision/publication labels so exports cannot be mistaken for all-finalized published marks. Escape quotes by doubling; quote fields; CRLF rows; UTF-8 BOM for spreadsheet compatibility. Neutralize spreadsheet formula injection in all untrusted string fields, including leading whitespace/control characters before =, +, -, @ (prefix a single quote). Do not execute formulas.

The full report JSON is an intentional export-sized snapshot, not a list page. Support the master-plan cohort sizes without silent truncation. The frontend renders the roster, snapshot revision/publication label, distribution and primary-topic metrics and lets staff print/save as PDF. Authorization must apply equally to CSV/report/history and normal API reads. Report a concrete scalability blocker rather than replacing a full export with the currently displayed page.

## F. Required real-backend evidence

Use docs/fixtures/official-results-v1.json as a synthetic grading/ranking/topic vector. Its keys are server-side test data, never an official student payload. Reproduce the expected scores, ranks, 18/30 Algebra total and distribution counts.

1. A teacher-created paper proceeds through approval, sitting, actual student final submission, deterministic marks, publication and student release; receipt contains no score. Prove final/score/receipt rollback together on forced failure.
2. Scores [20,18,18,10] rank [1,2,2,4]. Absent, invalidated and pending cases have null score/rank; a finalized all-unanswered paper legitimately has zero and is ranked.
3. Five included students × three Algebra items × two marks = 30 available marks; 18 earned = 60%. Unanswered items count, secondary topics and practice do not. Empty included set gives null topic percentage.
4. Unapproved even after planned date is hidden. Approved but one millisecond before release is hidden. Exactly at release is visible. Verify raw student JSON and receipts, not just UI text.
5. No publication while any accommodated student's final acceptance window remains open. Exact finalAcceptUntil is still blocked; one millisecond after is eligible. Race a final commit and publication under database locks.
6. Pending recovery without exclusion fails; blank/duplicate/foreign/finalized exclusions fail. Valid exclusion yields a visible status row with no mark. Evidence remains retained.
7. Later accepted recovery creates a new candidate, recalculates competition ranks/aggregates and leaves the old released report unchanged. New approval/time gates release the new revision; old export remains reproducible.
8. Same publication request after lost response, deadline and process restart returns original approval; changed key reuse/stale revision conflict. Verify persisted audit actor/reason/time.
9. Two schools, two teacher assignments and multiple students: cross-school IDs, other student's results, teacher school-wide export and pre-MFA admin access are denied. Test analytics, CSV and historical reports too.
10. More than 25 students and more than 25 sessions: page traversal is stable, full CSV/report contains every authorized row, counts match analytics, no row silently omitted. Test formula-like names and commas/quotes/newlines.

## G. Required implementation report

```text
Task: BE-05 official results and publication
Contract: v0.6 + backend-results-task.md
Implemented endpoints:
Not yet implemented:
Commit/build identifier and applied migrations:
Staging API URL and exact allowed frontend origin:
Synthetic seed/run instructions:
Tests: commands, pass/fail, evidence for each section F case:
Atomic submission/score/receipt and publication race evidence:
Publication revision/history and exclusion audit evidence:
CSV/report row counts and formula-escaping evidence:
Integrated frontend tested: yes/no, exact flow and devices:
Concrete blockers: affected requirement, evidence, impact:
Unaffected work continuing:
```

Do not include live credentials or private academic data in the report. Development simulator tests are not real database, security, browser, AI or 500-student capacity acceptance.
