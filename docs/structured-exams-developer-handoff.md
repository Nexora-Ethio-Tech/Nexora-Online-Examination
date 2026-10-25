# Nexora structured exams — developer implementation handoff

Prepared: 25 October 2026. Status: implementation specification, not a claim that these features already exist.

## 1. Purpose and delivery boundary

Implement five connected capabilities in the existing Nexora school exam portal:

1. Rich teacher review: add/edit/reorder questions, instructions, passages, images and tables.
2. Explicit exam sections and passage groups.
3. Question shuffling restricted to the correct section, question type and passage group.
4. Persistent access to the relevant passage/instructions while answering a question.
5. Imports that preserve this structure and expose uncertainties for teacher correction.

Deliver working frontend, backend, migrations, package generation, offline rendering, tests and documentation together. A mock-only interface is not completion. This file and the owner-supplied master plan are the requirements; implementation must preserve the existing security and examination lifecycle described below.

The repository baseline inspected for this handoff is commit `b2eebe412742841bb09ec5b15fb8be409f472e60`, branch `feat/verified-platform-development`. It includes the eleven recently completed school/staff improvements and migrations through `033_assistance_history.sql`. Those commits were local when this document was prepared. Do not assume GitHub already contains them. Obtain the owner's approved shared baseline before starting. This document itself will have a later documentation commit.

Read `AGENTS.md` and the master plan first. The repository names the master plan as **Final MVP Implementation Documentation v3.0 (12 October 2026)**; obtain the actual owner-supplied document rather than treating this handoff as a reproduction of it. If a conflict changes product behavior, record the conflict and ask the owner before implementing that part. Routine internal choices can be made and documented by the developers.

## 2. Scope and vocabulary

“Domain” means an explicit instructional section, not an AI topic label. Two multiple-choice sections with different instructions remain separate. A passage group belongs to one section and contains a passage plus its dependent questions. Section/group identity must not be inferred at runtime from question text, numbering or topic names.

Current supported answer types remain `mcq_single` and `true_false`. Essay grading, multi-select questions, audio/video, mathematical equation authoring, OCR of arbitrary scanned PDFs, collaborative live editing and a new proctoring system are outside this delivery. Preserve existing ordinary text and Unicode, including Amharic and mathematical symbols. Do not remove existing supported upload formats.

“Additional text” means student-visible explanatory context, headings or instructions. Teacher answer keys, AI explanations, review notes and internal flags are separate private fields. They must never become student content merely because the editor supports rich text.

## 3. Existing architecture and files to inspect

All paths in this document are relative to the Git repository root containing `package.json`, `src/` and `nexora-backend/`. The backend is inside the same working repository; do not create another Git repository inside it.

| Area | Starting points | Required impact |
| --- | --- | --- |
| Teacher authoring | `src/features/exams/authoring/TeacherDetail.tsx`, `schemas.ts`, `api.ts` | Structured editor, validation, previews and revision handling |
| Backend authoring | `nexora-backend/src/modules/authoring/authoring.service.ts`, `authoring.controller.ts`, `schemas.ts` | Scoped mutations and immutable approval snapshots |
| Imports and AI | `import-parser.ts`, `import.service.ts`, `import-worker.service.ts`, `review-flags.ts`, `ai-provider.ts` in the backend authoring directory | Preserve structure, bounded parsing, provenance and review warnings |
| Student package | `nexora-backend/src/modules/authoring/package-worker.service.ts` | Versioned public-content allowlist, immutable assets and encryption |
| Attempt ordering | `nexora-backend/src/modules/delivery/preparation.service.ts` | Replace global shuffle for new structured exams with constrained ordering |
| Answer handling | `nexora-backend/src/modules/delivery/delivery.service.ts` | Preserve stable IDs, validation, saving and final submission |
| Student runner | `src/features/runner/schemas.ts`, `engine.ts`, `store.ts`, `ExamQuestionSurface.tsx`, `RunnerPage.tsx` | Structured paper validation, passage rendering, offline media and navigation |
| Approval/scheduling | `src/features/exams/admin/`, backend `modules/administration/` | Preview complete content and freeze structural policy |
| Practice/results/recovery | Frontend and backend features with these names | Render released content consistently and preserve marking/recovery |
| Onboarding | `src/features/onboarding/guide.ts` | Update teacher/admin/student guidance; never open tours over an active exam |
| Tests | `tests/e2e/`, `nexora-backend/test/`, colocated frontend tests | Real API/database acceptance plus browser journeys |

Read `docs/package-preparation.md`, `docs/pending-features-architecture-and-testing.md`, `docs/deployment-developer-handoff.md` and `docs/testing/README.md`. Historical contract copies also exist under `nexora-backend/docs/Nexora_Backend_BE11_v0.12/`; use them as historical context, not a replacement for current executable schemas. Some older `AGENTS.md` document paths may have moved.

Verified baseline facts:

- The runner paper schema currently has top-level instructions and a flat `items` array. It is strict; adding properties without coordinated schema changes will fail validation.
- The backend package worker independently validates a student-field allowlist. Both sides must be updated and tested together.
- Authoring currently exposes `ordering: fixed | shuffle_questions_and_options`.
- Preparation currently generates `questionOrder` and `optionOrders`; global shuffling must not remain the algorithm for new structured exams.
- The compact single-question review UI already exists. Extend it; do not restore narrow editable tables or replace it with a separate disconnected editor.
- Frontend and backend currently use different major Zod versions. Do not directly import a schema across packages without handling their build/runtime compatibility. Use a deliberate shared contract or parity fixtures.

## 4. Non-negotiable invariants

1. Every database/resource operation is tenant-scoped and role/assignment-authorized on the server. A guessed section, passage or asset ID must not expose another school's data.
2. Preserve HttpOnly cookie sessions, Origin/CSRF protections and existing MFA requirements. Do not introduce browser-stored credentials.
3. Approved exam versions and downloaded packages are immutable. Editing creates a new draft/version and requires approval; existing attempts remain bound to their original version.
4. Answers and grades use stable question/option IDs, never display positions or letters. Deleting/reordering draft questions cannot change historical marks.
5. The original deadline, accommodation rules, device generation, assistance locks, receipts and recovery evidence remain intact.
6. Questions, passages, images and tables must all be inside the existing privacy/print/watermark protection surface. Do not render a passage in an unprotected portal outside that surface.
7. Student packages contain no answer keys, private explanations, internal review notes or private attachments. Build them from an explicit allowlist.
8. Preserve verified local persistence before download/readiness success. Missing media means incomplete preparation, not “ready”.
9. A student may continue offline after authorized unlock under existing rules; offline reload must not bypass online revalidation or pending staff approval.
10. Store timestamps in UTC; display Ethiopian calendar dates, Amharic month names, Latin digits and standard AM/PM EAT as elsewhere in the portal.

## 5. Teacher editor behavior

Keep the existing question card, Previous/Next/Save and next, numbered status navigation, unsaved-edit protection and bulk confirmation of eligible questions.

Add an exam outline showing ordered sections, instructions, passage groups and questions. Provide keyboard-accessible Move up/down controls even if drag-and-drop is added. Show section totals and total marks derived from questions, never maintained independently.

Required actions:

- Add/edit/delete/reorder a section; set its title, instructions and allowed question type.
- Add/edit/remove a passage group within a section; show its associated question count.
- Add a question manually with the same validation and review workflow as an imported question.
- Move a question to a compatible section/group, with confirmation if this changes its instructional context.
- Insert text, image or table blocks into section instructions, passage content and question content.
- Edit table rows/columns and header cells; upload/replace images and edit captions/alternative text.
- Preview the student view, including section instructions, passage references and sample constrained ordering.
- Remove a draft question with confirmation; never delete historical approved content or shared media still referenced by another version.

Deleting a section/group containing questions must offer an explicit safe choice: cancel, move its questions to a compatible destination, or delete them from this draft. Never silently orphan questions or move them to an unrelated instruction set. Deleting the passage while retaining dependent questions must require relinking or an explicit conversion to standalone questions.

An edit to student-visible question content, answer key, passage, instructions or media must invalidate affected review readiness according to existing review semantics. Unaffected questions retain their status. Changing a shared passage invalidates all dependent questions. The server must enforce this, not only the client. Preserve the existing distinction between structural errors, warnings and optional review confirmation; do not require tedious per-question clicks for clean content.

Use ordinary labels such as “Add passage”, “Add image”, “Add table”, “Questions using this passage”, “Keep question order” and “Shuffle questions in this section”. Do not expose internal schema terms to teachers.

## 6. Structured content contract

Recommended logical model below is a design target, not existing implemented DTOs. Final SQL table names and endpoint paths may follow repository conventions, but preserve these relationships and publish the exact executable contract before splitting frontend/backend work.

```ts
type ContentBlock =
  | { id: string; kind: 'text'; text: string }
  | { id: string; kind: 'image'; assetId: string; alt: string; caption?: string }
  | {
      id: string;
      kind: 'table';
      caption?: string;
      headerRows: number;
      rows: string[][];
    };

type Section = {
  id: string;
  title: string;
  questionType: 'mcq_single' | 'true_false';
  instructions: ContentBlock[];
  questionOrdering: 'fixed' | 'within_section';
  optionOrdering: 'fixed' | 'shuffle_mcq';
  units: Array<
    | { kind: 'question'; itemId: string }
    | { kind: 'passage'; groupId: string }
  >;
};

type PassageGroup = {
  id: string;
  sectionId: string;
  title: string;
  content: ContentBlock[];
  itemIds: string[];
  questionOrdering: 'fixed' | 'within_passage';
};
```

Keep a canonical question collection keyed by existing `itemId`. Extend question content with validated blocks without losing current fields needed for compatibility. A question belongs exactly once in the section/group structure. Preserve top-level general exam instructions separately from section instructions. Allow a diagram or table to serve as the shared passage/stimulus without forcing artificial prose.

Use ordered arrays or explicit positions consistently. Validate duplicate IDs, missing references, cross-section references, cycles, empty required content, illegal type mixtures and malformed table dimensions. Do not accept arbitrary nested JSON or arbitrary HTML/CSS/script. If limited bold/list formatting is introduced, enumerate supported nodes and validate/render them safely on both sides.

One passage group contains one question type in this release. If a source passage supports both MCQ and true/false, represent it in two explicit groups/sections with separate dependent questions; shared immutable asset bytes may be deduplicated. Do not mix the two types during shuffling.

Recommended initial configurable limits: retain the existing 200-question ceiling; 50 sections; 100 passage groups; 100 blocks per content container; 50 rows by 12 columns per table; 2,000 characters per cell; 50,000 characters per passage. These are proposed engineering defaults, not verified hosting capacity. Centralize limits, test boundary values, and document any justified adjustment before delivery.

## 7. Images, tables and storage

Support PNG, JPEG and WebP raster uploads initially. Validate actual decoded format, file signature, byte size and decoded dimensions; do not trust filename/MIME alone. Suggested defaults: 5 MiB per source image, 20 megapixels decoded maximum, 50 MiB total final exam media. Re-encode accepted raster images to remove metadata and reject invalid content. Confirm those limits against actual deployment request/storage limits before release; use a private direct-upload flow if necessary.

Do not accept SVG, executable HTML, remote image URLs, filesystem paths, archive traversal paths or automatic server fetches of arbitrary URLs. Use opaque server-generated asset IDs and private storage. Never store media in Git or rely on persistent server-local disk on Vercel. Use the existing storage abstraction if suitable; otherwise introduce a documented private object-storage adapter and a local test implementation. Do not assume a configured bucket exists.

Image lifecycle: upload authorization → private upload → server validation/finalization → attach to authorized draft → immutable approved asset reference → encrypted student package. Failed/unfinished uploads cannot be approved. Replacing an image creates a new immutable asset; it must not overwrite bytes referenced by an approved exam.

Use semantic table markup with captions and header associations. Initially support rectangular text-cell tables, not formulas, embedded scripts or nested tables. For unsupported merged cells in imports, retain provenance and show an explicit warning requiring correction; do not silently alter meaning. Wide tables scroll within their container, not the entire page. Images scale to the screen and can be enlarged within the protected exam surface.

Alternative text and captions must not inadvertently disclose answers; teacher preview must make them reviewable. Marking keys must never be placed in image filenames or asset metadata sent to students.

Do not implement broad automated deletion of historical assets as part of this task. Existing retention/recovery requirements still apply. Document abandoned-upload cleanup separately with ownership/reference checks.

## 8. Exact shuffling rules

| Entity | Rule for new structured exams |
| --- | --- |
| Sections | Teacher-defined order, never shuffled |
| General/section instructions | Always stay with their scope |
| Standalone questions | May shuffle only within their own section/type |
| Passage group position | Fixed among section units in this release |
| Passage-dependent questions | Stay in their group; fixed by default, optionally shuffle within that group |
| MCQ options | Fixed by default; independent opt-in policy |
| True/false options | Fixed true/false order |

For a section containing standalone questions and passage groups, shuffle standalone questions only among standalone slots. Passage groups remain intact in their original slots. Flatten the resulting structure into the existing attempt question-order list, preserving group contiguity. Store the structural mapping/version required to reconstruct the same display.

Generate ordering on the server once per attempt using a suitable unbiased shuffle; persist the result transactionally before returning it. Preserve the same result across retry, refresh, reconnect, browser replacement under existing transfer rules and recovery. Do not compute fresh random order in React. Test concurrent first-unlock/preparation requests for identical committed ordering.

The final question order must be an exact permutation: every eligible question appears once, none missing, none duplicated. Option order must likewise contain exactly the permitted option IDs. Grade by IDs and frozen keys. Display numbering is derived from the attempt order and must not be persisted as identity.

Questions referring to another numbered question or to “all of the above” may be order-sensitive. Detect known cases as warnings, support fixed-order settings, and require teacher resolution before enabling incompatible shuffling. Do not silently rewrite educational meaning. Prefer stable passage titles/references to hard-coded question ranges; generate any displayed ranges from the attempt order.

Existing exams: preserve already-approved packages and already-created attempt orders. Do not reinterpret the old global ordering enum for historical attempts. Legacy flat drafts can be opened through a compatibility adapter; before saving as the new format, explicitly split mixed types into compatible sections and show the conversion to the teacher. If instructional boundaries cannot be inferred, require confirmation rather than inventing them. Fixed legacy papers must retain their original question order unless the teacher explicitly edits it.

## 9. Student experience

The active question displays its section title and accessible section instructions. Linked passage content is always available from that question, including on direct navigation and resume.

- Desktop: responsive passage/question columns when sufficient width exists; no excessively narrow answer column.
- Mobile at 360px: passage above question with clearly labelled expand/collapse control. Start expanded when entering a passage group; remember the student's presentation preference while moving within that group.
- Navigating to another passage changes the displayed passage correctly. Navigating to a standalone question clears obsolete passage content.
- Keep question progress, answer controls, review markers and Previous/Next behavior unchanged.
- Do not lose typed/selected answers, scroll focus or passage context during routine timer updates.
- Passage/table/image controls must be keyboard accessible and remain usable at browser zoom. Avoid using color as the only status indicator.
- Security interruption hides every student-content region. Resuming after staff approval restores the same question and passage without extending the deadline.

Use the same safe renderer for teacher preview, admin approval preview, official runner and authorized practice wherever practical. Apply the correct public/private data projection at each boundary; sharing a renderer is not permission to share private data.

## 10. Offline package and version compatibility

Introduce an explicit content schema version independent of `examVersion`. Keep a reader for legacy packages; unknown future versions fail with a clear compatible-update message rather than showing an empty exam.

Freeze section order, passages, questions, policies and media digests at approval. The approved package must contain all student-visible content. Recommended initial implementation: include validated media bytes in the encrypted package with a manifest of asset ID, MIME, length and digest. If choosing separate encrypted media blobs for size reasons, document the encryption, authorization, manifest integrity, complete-download transaction and offline guarantees in an architecture decision before implementation.

No student-visible media may be served through a publicly readable URL before authorized unlock. Asset URLs that expire halfway through an offline exam are not an acceptable delivery mechanism. Blob URLs created after decryption must be scoped to the current package and revoked on cleanup.

Verify the full manifest and media before recording preparation/readiness. Persist atomically or use an explicit incomplete/complete marker that survives interruption. Handle quota errors truthfully; retain existing valid saved work and explain how to retry. Measure memory and storage usage at the documented maximum fixture. Do not label a package ready while its media is still loading.

An old installed application/service worker must not partially interpret a new package. Plan frontend/backend compatibility rollout and test old-client/new-package handling before enabling new-format approvals. Never force an update that discards an in-progress attempt.

## 11. Import formats and AI boundaries

Keep existing flat CSV/XLSX/DOCX behavior where supported by the actual parser. Add a documented structured template; do not require users to guess formatting conventions.

Recommended structured XLSX contract:

| Sheet | Required fields/purpose |
| --- | --- |
| Sections | SectionRef, Title, QuestionType, Instructions, QuestionOrdering, OptionOrdering |
| Passages | PassageRef, SectionRef, Title, Content, QuestionOrdering |
| Questions | Existing question/key columns plus SectionRef, optional PassageRef and explicit position |
| ContentBlocks | OwnerType, OwnerRef, Position, Kind, Text/AssetRef/TableRef |
| Tables | TableRef, Row, Column, Text, IsHeader |

Define exact headers, allowed values, ordering and uniqueness in a template README and supply a populated example. Imported references are scoped to the import and mapped to canonical server IDs; they are not authorization tokens. Spreadsheet image support must have a clear contract: either map supported embedded drawings reliably or let teachers attach images after import with visible unresolved-asset warnings. Do not claim full embedded-image support unless tested. A text-only CSV cannot carry image bytes; state that plainly in the upload UI.

DOCX: preserve paragraph order, headings, instruction blocks, tables and supported inline images. External relationships, macros and embedded executable objects are not fetched/executed. Ambiguous floating images or passage associations become visible warnings with source locations. Preserve the original private source for authorized review under existing retention policy.

Use deterministic parsing for structure wherever possible. AI may suggest passage boundaries, types, topics and explanations, but suggestions are untrusted and must pass the same schemas and reference checks. Uploaded text is data, not instructions to invoke tools, expose keys or change permissions. Do not use model output to authorize access or silently replace a supplied answer key.

AI failure must not hide successfully extracted questions/passages. Show separate parsing and AI-review states and preserve the existing cancellation, retry, worker lease, automatic school discovery and duplicate-request protections. Do not reintroduce per-school worker configuration. Bound archive expansion, entry count, parsing time, XML processing and image decoding. No ZIP traversal or decompression bombs.

For unsupported content, return a warning with source location and a specific teacher action. Never silently drop a table/image/instruction and mark the import complete without warning. Blocking structural issues prevent submission/approval until repaired; non-blocking suggestions follow existing review rules.

## 12. Database and API implementation requirements

Choose normalized tables or validated versioned JSON consistent with existing storage, but retain tenant ownership, immutable snapshots, referential integrity and revision checks. Suggested entities: draft sections, passage groups, content blocks, private media records and approved content manifests. Keep `itemId` and option IDs stable.

New migrations must use the next available migration number after inspecting the branch; do not assume 034 remains free. Never modify applied migrations 001–033. Include constraints, indexes, tenant RLS and grants for runtime/worker roles. Test with restricted runtime roles, not only a database owner. Do not bypass RLS for media/import convenience.

Required server operations, using existing route conventions:

| Operation | Required behavior |
| --- | --- |
| Read/edit structured draft | Authorized teacher/assignment; expected revision; return complete validated updated state |
| Create/update/delete/move question or section/group | Atomic reference/position updates; review invalidation; conflict response on stale revision |
| Begin/finalize media upload | Tenant/ownership checks, bounded validation, pending/ready/failed states |
| Import structured source | Existing idempotency/job/cancellation contract plus structure and warning results |
| Preview/submit/approve | Validate all references/media, preserve existing roles and workflow |
| Prepare/download/unlock | Versioned public package and persisted constrained attempt order |
| Practice/review results | Authorized released content only; stable scoring identity |

Document exact requests, responses, error codes, revisions and idempotency behavior in repository contract documentation and executable schemas. Use existing typed clients. For ambiguous/lost responses, retries must not create duplicate sections, questions, uploads or versions. Reordering must be one atomic operation rather than independent position writes that leave a partial structure.

Audit content/structure changes with actor, school, exam/version, action, server time and relevant identifiers. Do not log uploaded full exam content, keys, signed upload URLs or secrets. Preserve existing review/approval audit semantics.

## 13. Implementation stages and team boundaries

Work on a feature branch based on the owner-approved current baseline; suggested name: `feat/structured-exams`. The branch name is a suggestion for the receiving team, not a branch created by this document.

1. Record baseline SHA, reproduce existing tests, publish contract/architecture decisions and fixtures.
2. Add schema/migrations and legacy read adapter; prove old attempts/packages remain unchanged.
3. Implement scoped authoring mutations, revision handling and review invalidation.
4. Implement private media validation/storage and safe content renderer.
5. Extend teacher editor and admin preview.
6. Extend structured imports, templates, warning/provenance handling and AI adapters.
7. Freeze approved structure/media and build versioned encrypted packages.
8. Implement server-side constrained ordering and student passage/offline display.
9. Complete practice/results/recovery compatibility, security and cross-tenant tests.
10. Update onboarding, architecture/testing/deployment guides and submit the integrated branch for review.

One developer should own the shared contract and migration numbering. Frontend, backend and importer developers may work on separate branches after agreeing on the contract, then integrate into the feature branch. Do not independently invent incompatible schemas. Around ten meaningful commits across these stages is appropriate; avoid empty commits or deliberately broken checkpoints merely to meet a number.

Use `git status` before editing. Do not initialize Git again, reset the owner's work, force-push, or copy an older alternate Nexora implementation over the current repository. Submit a pull request to the owner-selected integration branch when the owner authorizes publishing. Merging, deployment and hosted migrations require a separate release decision.

## 14. Development and verification commands

Run from the actual repository root, not the developer's home directory. Node 24 and npm are the current project baseline. Install frontend and backend dependencies with their existing lockfiles.

```powershell
npm ci
npm --prefix nexora-backend ci
npm run check
npm run build
npm --prefix nexora-backend run build
npm --prefix nexora-backend run test:unit
npm run e2e
```

On an already provisioned local test environment:

```powershell
node scripts/local-test.ts db
node scripts/local-test.ts migrate-test
node scripts/local-test.ts test
```

The local launcher depends on private machine-specific `../.local-test/config.json` and the configured PostgreSQL installation. A fresh clone does not contain them. Follow `docs/local-integrated-testing.md` and `docs/testing/README.md`, provide reproducible setup instructions for a fresh developer machine, and use new synthetic credentials. Never request the owner's production `.env`, MFA secrets or production database export as a shortcut. A separate disposable PostgreSQL environment is required for integration tests; an absent database is a reported blocker, not a passing test.

After disposable migration/integration tests pass, the owner may apply migrations to their persistent manual local test database using the guarded launcher. Do not run generic backend migration commands against an unverified `.env` URL. The current hosting target is Vercel; document any storage/worker/environment additions and test them in an isolated preview deployment before production approval.

## 15. Required acceptance fixtures and tests

Create a synthetic exam containing: two MCQ sections with different instructions, one true/false section, two passage groups, a standalone image question, an instruction table, Amharic text, unequal marks and one order-sensitive question. Include at least 20 questions. Keep a known answer map by ID.

| ID | Test and expected result |
| --- | --- |
| A01 | Teacher adds/edits/removes/reorders questions and blocks; save/reload preserves exact structure and totals. |
| A02 | Unsaved edits block accidental navigation; Save and next persists; Next alone does not mark reviewed. |
| A03 | Shared passage edit invalidates dependent reviews only; changing a key cannot retain stale approval readiness. |
| A04 | Deleting/moving a group cannot orphan questions; incompatible type moves are rejected server-side. |
| A05 | Two staff edits using the same revision: one succeeds, the stale operation conflicts without lost updates. |
| A06 | Another school/user cannot read, attach, finalize, preview or download any draft/media by guessing IDs. |
| A07 | Spoofed MIME, SVG/HTML, oversized/invalid image, archive traversal and malformed content JSON are rejected. |
| A08 | Structured import reproduces section/group/table/image associations or reports explicit unresolved warnings. |
| A09 | AI unavailable/cancelled/retried: extracted structure is retained and no duplicate questions/jobs are created. |
| A10 | Repeated generated orders never cross section/type boundaries or split a passage group; exact permutation holds. |
| A11 | Fixed passage questions remain ordered; opt-in passage shuffle is confined to that group. |
| A12 | True/false option order stays fixed; MCQ option shuffle uses stable IDs and respects fixed-order exceptions. |
| A13 | Concurrent preparation, retry, reconnect and replacement browser preserve the attempt's committed order. |
| A14 | Known answer map produces identical grades under many shuffle seeds; marks and results remain correct. |
| A15 | Every linked question shows the correct passage/instructions at desktop, 360px mobile and landscape widths. |
| A16 | Keyboard, screen reader labels, zoom and wide-table scrolling work without obscuring answer controls. |
| A17 | Fully prepared exam works offline with all images/tables; no external content request is required after unlock. |
| A18 | Interrupted download, corrupt media digest or storage quota failure never records false readiness. |
| A19 | First security interruption hides passage and question together; approved resume preserves answers/order/deadline. |
| A20 | Reload while offline or awaiting staff approval cannot bypass existing revalidation/lock rules. |
| A21 | Student package inspection finds no key, explanation, review note, private asset or pre-unlock public media leak. |
| A22 | Editing after approval creates a new draft/version; old packages, assets, attempts and grading stay unchanged. |
| A23 | Existing flat exams and already-started attempts work after migration; legacy fixed order remains fixed. |
| A24 | Unknown schema version fails clearly; old clients cannot partially render new structured papers. |
| A25 | Practice/released review renders correct passage/media without leaking unreleased explanations or changing marks. |
| A26 | Migration works on an empty database and populated baseline; restricted-role RLS/constraints and rerun behavior pass. |
| A27 | Max-size documented fixture meets measured package/storage/render limits; report actual timings and environment. |
| A28 | Existing cancellation, automatic worker discovery, roster, MFA, scheduling, result release and recovery regressions pass. |

Use unit/property-style tests for permutation and schema invariants, real HTTP/PostgreSQL tests for authorization and concurrent writes, and browser tests for complete authoring → approval → download → attempt → result journeys. Synthetic browser tests do not prove database isolation. Do not disable failing tests or accessibility rules to obtain a pass.

## 16. Release and rollback plan

Use additive migrations and support old packages before enabling creation of new ones. Validate restoration/backups in isolation. Rollback must disable creation of new-format exams while retaining a compatible reader for already-created versions; blindly reverting the frontend after students download a new-format package is unsafe. Never drop content/media tables as a routine rollback.

Deliver a rollout order covering database, backend/worker, storage configuration, frontend and feature enablement. Include required environment-variable names with dummy values, storage permissions, limits and preview checks. Do not include real credentials. Identify anything the owner/hosting operator must configure, including private buckets and worker deployment, in a separate actionable checklist.

No hosted Supabase migration, production upload, production test data or deployment is authorized by this handoff alone.

## 17. Definition of done and return package

- All five capabilities work together against the real local backend/database.
- All acceptance cases have pass/fail evidence, or a clearly named unresolved blocker; no blanket “everything tested” statement.
- The branch contains migrations, schema/contracts, frontend/backend/importer changes, populated templates and test fixtures.
- Existing exam data and active attempts are preserved; no unrelated portal redesign or security-policy change.
- Onboarding and architecture/manual testing guides reflect the new screens.
- A fresh developer can reproduce setup without the original owner's machine or secrets.
- The pull request identifies base/head SHA, changed areas, migration numbers, dependencies, configuration, actual tests and remaining manual checks.
- Include desktop/mobile screenshots, a short user testing order and a deployment/rollback checklist.
- List deviations from this specification and why. Obtain owner agreement for product-scope changes before treating them as complete.

The owner should review the integrated branch and test synthetic exams locally before authorizing merge or production migration. This handoff prepares that work; it does not certify an implementation that has not yet been built.
