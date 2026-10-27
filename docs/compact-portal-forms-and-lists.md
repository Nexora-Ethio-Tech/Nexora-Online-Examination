# Compact portal forms, lists and roster login details

26 October 2026. Implemented in the local frontend and backend source; deployment and real database acceptance are separate.

## Connection feedback

The school and owner portals show one top connection indicator. It distinguishes browser offline status from transport failure or an unavailable server. A browser's online flag is not proof that the API is reachable, and neither state proves a student's exam is ready. The single banner can retry active reads. Query cancellation does not mark the connection unavailable. Background read errors no longer repeat generic connectivity alerts throughout the page. Non-network errors and failed explicit actions retain their local feedback. Live monitor freshness warnings, device saves, pending uploads and committed submission confirmation remain separate.

## Forms and contextual editing

Required native controls display a red asterisk through their label caption. Authentication's shared FormField propagates native required semantics and an aria-hidden marker. Required date groups also show the marker; optional filters do not. Existing validation remains authoritative. Schema-required exam metadata and core question fields now expose native required semantics too.

EditDialog uses the existing Radix dialog, focus containment, Escape/X dismissal and focus restoration. Changing a field requires explicit discard before X/Escape closes an editor. Outside clicks do not discard work. Saving school operations and unresolved extra-time requests cannot be dismissed through X. Account edits, password resets, class/subject creation and editing, new-paper details, extra-time editing and owner school actions use contextual dialogs. One-time login lists block dismissal until the administrator acknowledges saving or the need for explicit resets. Downloading the same file again remains possible while the list is open.

Assignment activation stays inside its row. Full question authoring, approval/scheduling, result publication, recovery evidence and device-transfer review retain their full-page context. Question navigation is paginated so it does not push the selected editor far down the page.

Assignment filters use a compact wrapping toolbar with Clear filters, replacing duplicate grade/class button rows. Admin exam filters keep search, grade, class, Clear filters and More filters in one row on wider screens. Teacher, subject and submitted date fields expand below only when More filters is opened. The disclosure exposes its expanded state to assistive technology; collapsing it preserves selected filters. Controls wrap on narrow screens and retain touch targets.

## Pagination and cache policy

Pagination, usePagedQuery, useCursorPages and useLocalPagination supply reusable navigation. Infinite reads retain fetched pages in TanStack Query memory but display one page. A failed Next request keeps the current page. Filter/identity changes return to page one; previous fetched pages do not require another request while cached. Cursor endpoints retain cursor history rather than making Previous jump to the first page. Complete selector options remain separate from visible directory pages.

Applied to school records, account class cards/accounts, teacher assignments, directory activity, student/teacher/admin exam lists, results lists and marks, practice, recovery, monitor cursors, extra-time rosters, owner schools, assistance requests/history/staff, roster validation, private login lists, question navigation, admin question/history review and security incident collections. Short enumerations, choices, filters and aggregate charts remain unpaginated. Report print output and exports retain complete records; pagination does not change official ranking or totals.

Search/list records use a 30-second freshness window and 10-minute unused memory retention. Class/subject/teaching-assignment choices use five-minute freshness with the same retention. Account and assignment searches settle after 300ms. Relevant school writes invalidate affected school and teaching-assignment reads. Cache keys contain the school and signed-in user; authentication transitions clear private queries. Live/time-sensitive reads retain explicit refresh intervals, including visible monitor refresh every 15 seconds. No persistent browser search cache or new dependency is introduced. One-time passwords stay outside query/mutation caches and browser storage.

## Roster commit contract addition

`POST /students/import/:id/commit` accepts additive `issueCredentials: boolean` (default false for older clients). The primary roster UI sends true. Existing revision, actor/tenant/MFA/CSRF, class lock, expiry and duplicate-reference checks remain. In the existing tenant transaction, allocate each student ID, generate a distinct secure password and salted Argon2id hash, insert the active account with issued credentials, insert enrollment, record the committed import and audit, and retain the idempotency response. Any failure rolls the transaction back.

When true, the response adds required `loginDetails` using `credentialIssueSchema`: issue identity/time/count, affected account identities and the one-time credentials. Both directory_imports.committed_result and idempotency_keys.response_body store the same metadata with nested credentials null. Identical committed retries return these redacted identities without issuing again; conflicting payload/key reuse is rejected. Passwords are not stored for later retrieval. Missing original responses require explicit resets in Accounts.

The UI opens one private list with one complete CSV download immediately after save. Accounts remains the optional path for individual edits, resets and legacy unissued accounts. Underlying import state survives opening the login dialog. In-flight import navigation and reload are guarded because leaving can lose the one-time response. No automatic mutation retry is added.

Large imports hash one password per student before committing. The frontend allows up to 15 minutes for this explicit operation and explains that it can take several minutes. Reverse-proxy limits and full-roster hashing latency still require host acceptance; this is not a capacity claim. No migration is needed. Deploy the backend before or with the frontend: the new UI requires loginDetails when requesting automatic issuance and does not silently fall back to separate generation.

## Verification

Unit coverage includes cached page back-navigation, failed next pages, filter resets, guarded dialog dismissal, connection loss/recovery/cancellation, automatic import issuance and redacted replay stores. Backend service tests exercise actual password hashing and verify that failed account writes do not record a successful import or idempotency response. These mocked transaction tests do not establish real database rollback or races.

The jsdom suites run serially to avoid starving cold lazy-route imports. Initial monitor/recovery route waits allow five seconds, matching neighboring cold-route waits; product timing and stale-data assertions are unchanged. The synthetic browser journey checks required markers, unsaved edits, filter overflow at configured viewports, roster review/save, private CSV download, accessibility and the single offline notice. Existing production-shell, offline-answer and receipt tests remain required. Actual command results are recorded in the delivery report; synthetic tests do not establish real API acceptance or physical phone/network behavior.
