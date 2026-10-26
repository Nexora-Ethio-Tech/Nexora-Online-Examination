# Structured exam content: architecture and testing

## Implemented design
Migration 034 adds a structure JSON field to drafts and content/section/passage fields to question rows. Sections and passages have explicit stable IDs. Each section defines its question type, instructions and shuffle setting. Each passage belongs to exactly one section; questions reference it by ID. The server validates membership, question types, duplicate IDs and content sizes.
Teachers use the existing Review tab. The outline editor adds sections, shared passages, manual questions, text, images and tables; it supports ordering and draft question removal. Existing questions' text, options, answer and marks remain in the established individual review editor. The outline editor can remove an empty section or unused passage; move or unlink its questions first. It does not silently cascade-delete them. New questions start unreviewed. A safe default placeholder must be replaced in question review before approval.
The outline save locks the teacher-owned exam, enforces assignment/tenant/role, draft state and revision, retains an idempotency key, snapshots old content and uses one transaction. It refuses structural edits while import/AI processing is active. Existing AI evidence cannot be edited through it. Changed section/passages invalidate review only for affected questions. Old approved versions and attempts are not edited.

## Images and tables
The browser decodes PNG/JPEG/WebP uploads, resizes to at most 1200 pixels and re-encodes PNG, dropping original metadata. Required alt text and optional captions are editable. Images are bounded to approximately 200 KB each and the entire outline request to 4 MB. The backend checks PNG structure, checksums, dimensions and decompressed pixel length. No SVG, external image URL or HTML content is accepted.
Raster bytes are embedded in the approved encrypted package, rather than downloaded from public URLs. This deliberately uses inline immutable media instead of a separate asset service: checksum verification and IndexedDB persistence cover all media together, and offline rendering needs no additional network requests. It bounds paper size and avoids a public asset permission path. Tables support up to 10 columns and 30 rows, column headings and editable cells. Plain text is rendered through React, never injected as HTML.

## Imports
Existing nine-column DOCX/XLSX question templates remain valid. Optionally append exactly four columns: section, section_instructions, passage_title, passage_text. All four headers must be present when using them. Repeat identical section instructions and passage text for questions referencing the same named group; conflicting text is rejected with diagnostics rather than guessed. Types must not mix within one section.
Images and arbitrary nested tables embedded in office documents remain unsupported by the bounded importer. Add images and display tables in Review after import. This restriction is explicit: import does not silently discard embedded objects. General OCR/free-form document understanding is not implemented.
AI input now includes imported textual instructions and passage context. Manual/shared-content edits invalidate review and require checking the answer/explanation; they do not silently replace existing AI explanations.

## Approval, ordering and reading
Approval copies question content and references into immutable version rows and stores the full structure in frozen metadata. Package generation validates the public allowlist and images. Correct keys, private explanations and review evidence stay out of official packages.
New attempts use explicit section order. Shuffling only occurs inside a section/type/passage bucket; passage questions remain together. A section can keep its question order even when exam shuffling is on. True/false options retain their semantic order. Historical attempts retain stored orders. Legacy unstructured fixed papers preserve their order; newly prepared shuffled legacy papers keep question types separate.
The runner shows section instructions and the referenced passage alongside each dependent question, inside the security-protected question surface. Administrator review and released practice render the same content. Reading passage content does not require an external URL or separate hidden tab.

## Test sequence
1. Apply migration 034 only to the local disposable database first. Start backend/frontend with that database.
2. Create a teacher draft, import the normal template and confirm it still reads.
3. In Review add one multiple-choice section and one true/false section. Assign each matching question. Add a passage and link two MCQs to it.
4. Add text, a table and a small image with alt text. Save; reopen to verify persistence. Preview student content. Try a large/corrupt file, missing image description, wrong section type and orphan passage; each must be rejected.
5. Review the questions; edit the shared passage and save. Its dependent questions should become unreviewed while unrelated questions stay reviewed. Try stale revision and unauthorized school/student requests; they must fail.
6. Approve the paper and download as a student. Verify section titles, instructions, passage, picture and table. Switch questions in a passage group; context remains available. Use offline continuation under existing runner rules and confirm no media fetch is needed.
7. Prepare multiple attempts with shuffling. Verify section order, type boundaries, passage grouping and stable true/false option IDs. Previously prepared attempts must not change.
8. Confirm approved content cannot be edited, official package has no answers/explanations, and released practice has the correct context and existing feedback rules.
9. At 360px width, check table horizontal scrolling and readable images, keyboard controls and question navigation. Continue existing answer persistence, timer, assistance, submission and recovery checks.

## Deployment
Frontend and backend changes must ship together after migration 034. No production migration or deployment was run for this implementation. Do not retire existing services until the combined-deployment smoke tests pass.

## Verification completed locally (26 October 2026)

Frontend typecheck, lint, formatting, unit tests and production build passed. Backend build and 237 unit tests passed. Migration 034 was applied to the isolated nexora_be02a_test database on localhost only. Thirty real API/database/browser integration checks passed, including owner/school cookie isolation, Origin rejection, structured save/replay/stale-revision checks, review invalidation, approval/package freezing and a 360px editor save/reload journey with a no-horizontal-overflow assertion. The mobile screenshot was inspected. No production mutation, live cutover or Vercel project deletion was performed.
