# Question review usability

Task 1 of the approved 15-improvement backlog, 22 October 2026. Covers items 8–10 and related onboarding.

## Architecture

The provider prompt now identifies the answer-key field explicitly and treats an empty optional topic vocabulary as normal. Only substantive question defects belong in warnings. A conservative exact-message classifier removes known metadata advice and positive comments from new suggestions and draft read responses. It does not erase historical database evidence, change teacher keys, remove unfamiliar warnings or override `keyConsistent=false`. Existing unsupported missing-key warnings still need teacher review; the prompt improvement is not retroactive AI re-evaluation.

Bulk confirmation now excludes any question with a warning or conflicting key, even if a note was entered. Complete unconfirmed questions without warnings can be confirmed together. Individual confirmation and the final teacher submission remain deliberate actions. Backend eligibility is authoritative; frontend and demo mirror it. Existing tenant scope, optimistic revisions, idempotency and review snapshots remain intact.

The import panel retains one Review imported questions shortcut. The duplicate submission shortcut is removed. Phones show question cards; desktop keeps the overview table. Selecting a mobile card scrolls to the full-width editor. Previous/Next navigation cannot discard unsaved edits. Save and next retains the existing next-unreviewed behavior.

## Testing guide

1. Use the real local setup and a teacher account. Import a supported template and wait for AI processing. Review the actual warnings; topic-vocabulary advice should not appear as a defect.
2. Open Review questions. Check the count beside Confirm all questions without warnings. Confirming requires the checkbox, and skips incomplete or flagged questions.
3. Resolve a genuine warning individually. A resolution note alone must not make an unconfirmed warning eligible for bulk confirmation.
4. At 360px width, verify readable question cards, full-width fields, and navigation without sideways page scrolling. Unsaved edits must disable question switching. At desktop width, verify the overview table.
5. Confirm there is one import-to-review shortcut, and no duplicate Go to question reviews button in the submission panel.
6. Submit only after all required confirmations. Changing a question must still invalidate its review and prevent late AI suggestions from overwriting the edit.

Automated coverage includes warning classifier regressions, frontend bulk eligibility, backend bulk selection, the teacher editing journey and existing real API/database import cases. Live AI quality and physical mobile-device acceptance are distinct from those tests.

Verified: frontend check (230 tests plus 14 release/config cases), frontend build, backend build, 170 backend unit tests, and 18 real local integration cases passed. Production build retains existing chunk-size and dependency annotation warnings. No live AI call was required for this task.
