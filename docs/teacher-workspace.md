# Teacher exam workspace

Latest update: the [administrator increment](admin-approval-scheduling.md) now connects teacher submissions to admin review and scheduled student papers in the same demo tab. Sign out/in to switch roles without reloading. Contract v0.5 adds BE-04; BE-03 teacher wire formats are unchanged. The implementation notes below record the original teacher increment.

Implemented frontend increment, 14 October 2026. Master plan v3.0 sections 6–7; contract v0.4 and BE-03. This is frontend and fixture-simulator evidence, not real backend acceptance.

## Try it

In the repository terminal run `npm run dev:demo`, then sign in as DEMO-TEACHER with password NexoraDemo!. Select New exam, enter a title, select Grade 10 A / Mathematics and save the draft. Edit the remaining metadata as needed. Download either example under Import and upload it unchanged. The two questions total four marks. The simulated job completes after about two seconds. Open Review questions, inspect both keys and explanations, check the review confirmation and save each question separately. The second question has a review flag; add a resolution note before confirming it. Submit for approval becomes available after both reviews are saved. Submission makes the paper read-only.

Demo accepts only the exact distributed example bytes, identified by SHA-256. Edited files return explicit diagnostics and preserve previously imported items. It is not an arbitrary DOCX/XLSX parser. AI text is seeded, not provider-generated. Full browser reload resets the in-memory demo server and authentication; real drafts/jobs must persist on the backend. Teacher submissions now connect to the admin workspace and student schedule through the shared in-memory simulator.

## Implemented behavior

Scoped, paginated paper list and assignment selection; create/update metadata; computed server marks/counts; Word/Excel download links; multipart upload and client file size/extension checks; actual API job polling with progress and diagnostics; AI retry UI for eligible failed jobs; side-by-side question/key and topic/explanation review; plain field corrections; explicit resolution notes; optimistic aggregate revisions and per-request retry keys; unsaved edit navigation guard; submit gating and read-only state; returned-comment display. Never grants teacher approval or release permissions. Server state uses owner-scoped TanStack Query and all requests use the existing typed client with CSRF.

Request keys survive retries within the mounted form. Draft content is server-owned and saved explicitly, not autosaved; unsaved browser edits are not durable offline work. Save a question before editing another. Reload after an ambiguous response to reconcile server state; never assume an upload or submission succeeded from a click alone. Failed uploads leave existing question data for review. Real backend must enforce all rules regardless of UI state.

## Backend delivery

Send docs/backend-teacher-exam-task.md and updated docs/api-contract.md. Include src/features/exams/authoring/schemas.ts, api.ts, and public/templates/nexora-questions.docx and nexora-questions.xlsx. Tell the developer to implement BE-03 exactly, preserve BE-02, run its real parser/AI/isolation/revision/idempotency tests, and return the specified report. The project owner supplies clarifications; no alternative interface choice is delegated.

## Remaining acceptance

Verification on 14 October: `npm run check` passed type checking, lint, formatting and 79 tests across 14 files. `npm run build` passed; existing large-chunk/Zod annotation warnings remain. Added tests cover both fixture imports, key/mark fidelity, required flag resolution, stale revisions, duplicate request replay, role denial, multipart/CSRF, failed replacement preservation, unsaved metadata navigation and the full upload/review/submit component journey. Production output scan found no teacher demo identifiers. Word/Excel extraction confirmed identical nine-column, two-question content; Excel preview was visually inspected. Browser automation failed to initialize with “failed to write kernel assets”, so no live browser visual verification is claimed for this increment.

Real API and PostgreSQL integration, arbitrary valid template parsing, hostile file rejection, real AI in English/Amharic, durable job restart/retry, two-school permissions, administration approval/scheduling and real-device inspection remain separate acceptance work. Word rendering could not run locally because LibreOffice is absent; its OOXML table structure must be verified and its visual layout checked in Word/LibreOffice. This limitation does not establish a parser failure.
