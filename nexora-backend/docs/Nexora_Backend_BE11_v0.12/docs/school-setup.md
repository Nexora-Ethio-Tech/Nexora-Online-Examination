# School setup and accounts

Implemented frontend slice: BE-08, API contract v0.9, master plan sections 6.1–6.3. Open the administrator workspace → **School setup**. Production storage, account security and roster delivery require the backend implementation in backend-school-task.md.

## Normal workflow

1. **Classes:** add a class name and academic year, with a reason. Edit names or archive unused classes. Existing students, assignments and exam references prevent archiving.
2. **Subjects:** add a subject name and unique code. Existing assignments/exams prevent archiving.
3. **Accounts → Teachers:** enter the teacher's name and reason, then create the account. Save the generated user ID and password privately from the one-time view. Close only after acknowledging that missing passwords need a reset.
4. **Assignments:** choose an active teacher, class and subject. Save with a reason. The assignment becomes available in that teacher's exam workspace. An assignment referenced by an exam cannot be deactivated in this MVP.
5. **Roster import:** download the example CSV. Keep its exact header `studentRef,displayName`; use a distinct school reference for each student. Select one class, upload and preview. Correct every reported error in the source file and upload again. Preview creates no accounts. Review the intended class and every row, enter a reason, confirm and import. Importing adds all validated students or none; it does not silently merge people.
6. **Accounts → Students:** select unissued active students, individually or using the loaded-record selection button. Load additional pages as needed. Generate credentials in batches of up to 500. Each batch is available once in the view, with one intentional CSV download.
7. **Accounts:** search by name, login ID or student reference. Edit a student's class/name or an account's active state. Class changes affect future rosters; frozen sitting rosters stay unchanged. Deactivation signs the account out.
8. **Reset password:** find the exact account, enter a reason and confirm the sign-out effect. Save the new credentials. Existing sessions expire, while saved exam answers, receipts and recovery evidence remain intact. Old passwords cannot be retrieved.
9. **Activity:** inspect changes, target labels, reasons, actor names and EAT timestamps.

Blank reasons, missing selections or unchecked confirmations keep relevant actions disabled. Refresh retrieves current server records; Load more reads additional records without imposing a school quota. Stale-revision errors require refreshing and reviewing changes before retrying.

## One-time credentials and retries

Passwords appear only in the temporary credential view. They are not stored in browser storage or the query/mutation cache. Navigation warns before discarding the list; reload/sign-out clears it. The downloaded CSV is a private file the administrator deliberately saves and distributes outside this application.

If a successful issuance response is lost, retry with the unchanged form. The same request key returns issue metadata and affected account IDs, with no passwords and no new issuance. Use those IDs to find and explicitly reset the affected accounts. A request retry must never silently rotate passwords. The backend must store only salted Argon2id hashes, including in idempotency records and logs.

## Local demo limits

Run `npm run dev:demo`. Sign in as `DEMO-ADMIN` / `NexoraDemo!`, MFA `123456`. Use synthetic CSV data only. Directory changes live in this tab's memory; full reload clears them. Sign out and log in within the same tab to test generated IDs/passwords. New teachers see their assignments and can create their own drafts; new student accounts have empty exam/result/practice lists so they cannot receive Samira's example data.

The existing official delivery/results fixtures represent only Samira and the original Grade 10 A Mathematics assignment. New sittings in demo mode require that original assignment and Samira as its sole active student. Scheduling another roster shows a specific demo-limit message instead of pretending it scheduled all imported students. Import into a new class when testing directory setup alongside the original exam demonstration. Full multiuser scheduling, attempts, results, practice and database isolation are backend acceptance work. Existing frozen fixture sittings remain unchanged by later roster edits.

Resetting a seeded demo password makes the README password invalid until the next full reload. This is intentional. The simulator uses a fast digest only for synthetic in-memory login checks; it is excluded from production builds and is not production password storage.

## Verification

Automated coverage includes role/MFA gates, unknown IDs and forbidden fields, duplicates/revisions/archive dependencies, CSV quoting/BOM/invalid files and row errors, preview expiry/class changes, atomic/concurrent import simulation, replay, pagination/search, one-time issuance and cache exclusion, lost-response identity recovery, password/session invalidation with retained exam records, generated teacher draft ownership, CSV formula escaping, confirmations and navigation warning.

Run `npm run check` and `npm run build`. Browser checks cover actual controls, native CSV upload and responsive layout. These tests do not prove real database rollback, concurrent transactions, cross-school isolation, server hashing, phone/network behavior or 500-student capacity. The backend must return the evidence required by BE-08 section 5.

## Backend handoff

Send `Nexora_Backend_BE08_v0.9.zip` from the workspace handoffs folder. Instruct the developer to read START-HERE.txt, implement backend-school-task.md and the exact school schemas/API calls, integrate BE-02/03/04/05 ownership and frozen-roster rules, and return the required evidence report. The package contains mandatory requirements, not alternatives for backend approval. Earlier issued tasks remain dependencies.
