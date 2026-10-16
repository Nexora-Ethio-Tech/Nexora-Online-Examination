# Administrator approval and scheduling

Frontend increment, 14 October 2026. Master plan v3.0 sections 6–12; API contract v0.5 and BE-04. Development simulation is not real-backend acceptance.

## Try the connected demo

1. Run `npm run dev:demo` in the frontend checkout (locally still named exam-frontend). Sign in as DEMO-TEACHER / NexoraDemo!, create a draft, upload an unchanged downloadable sample, review both items, resolve the second item's flag and submit. Use a short duration if desired; duration does not select a start time.
2. Click Sign out and sign in as DEMO-ADMIN / NexoraDemo!, MFA 123456, in the same tab. Do not reload. Open Review and schedule. Check the full questions, supplied keys, topics, explanations and teacher notes. Enter your comment and either return for correction or check the review confirmation and approve.
3. On approval, schedule preparation in the future using EAT (UTC+3), regardless of computer timezone. The preview calculates common start exactly ten minutes later and end from the approved duration. Choose a planned results time at or after the end, confirm the dates/class, then Confirm schedule. The server response displays the sitting and frozen roster count (one synthetic student in this demo).
4. Sign out and sign in as DEMO-STUDENT / NexoraDemo! in the same tab. Your newly scheduled title appears among the seeded exams. Open it, download during preparation, then keep the tab connected. It unlocks at the scheduled common start using the exact approved paper. The full ten-minute preparation interval is not shortened. Normal runner saving/submission/receipt rules apply.
5. Before preparation opens, the admin can change the schedule with a reason. At/after the old preparation time, the server rejects schedule changes. Refresh paper to obtain the latest lock state. An additional nonoverlapping sitting requires the explicit Schedule another sitting action.

Full reload/new tab resets this in-memory simulator, including authentication and authoring/schedules. It retains data across sign-outs only. It has one synthetic class/student and is not real roster management. Existing seeded Math/English exams remain available independently. Demo package readiness is immediate from a frozen synthetic artifact; real durable package jobs must be implemented by the backend. Fixtures and seeded AI do not prove parsing/model quality.

## Built behavior and limits

Admin paper list/detail with loading/empty/error/retry; complete private content preview; explicit review acknowledgment and required comment; return feedback visible to the teacher; revision-protected immutable approval; package status/error/retry controls; EAT inputs and calculated timing preview; future-time/result-date checks; persisted-response scheduling confirmation; schedule revision/reason checks; audit history; class roster count; explicit additional sittings. Existing typed API client, owner-scoped TanStack Query, role/session guards and UI controls are reused without new dependencies.

Scheduling sets a planned results date only. Result publication, practice access, live invigilation statistics, recovery decisions, directory/roster management and reporting screens are not included in this increment. Real server rules enforce accommodations and isolation; demo roster count is synthetic. No secrets or answer metadata are allowed in official student plaintext.

Request keys are retained for retries in the mounted screen. Refresh to reconcile after an ambiguous response. Unsaved scheduling/comment fields are ordinary browser form state, not an offline exam outbox. Server authorization, revision checks and old-preparation time govern every mutation even if a stale browser still shows an action.

## Backend instructions

Send the BE-04 handoff package. Tell the developer: read START-HERE.txt, implement docs/backend-admin-exam-task.md exactly under contract v0.5, keep BE-02/BE-03 compatible, connect the full persisted role journey and return the specified report. The package includes executable request/response schemas and predecessor contracts for context. Report concrete blockers with evidence rather than substituting interfaces.

## Verification

`npm run check` passed type checking, lint, formatting and 89 tests across 16 files. `npm run build` passed with existing Zod annotation and large-chunk warnings. No dependencies were added. Automated tests cover approval/return/stale-revision rejection, audit sequence, duplicate replay, teacher mutation denial after approval, past preparation/early results/overlapping schedule rejection, explicit EAT conversion and invalid dates, rescheduling at preparation boundaries, denied teacher/student/unfinished-MFA access, exact approved encrypted paper delivery, stable shuffled orders and a matching final receipt. Component tests exercise admin review confirmation, return feedback, time preview, scheduling and change reasons. These are development tests, not real API/database or capacity results.

Live browser automation currently fails to initialize with “failed to write kernel assets”; no new visual browser check is claimed. Real phones, multiple schools, durable database transactions, real package jobs/AI, accommodation/roster snapshots, deployment and live role integration remain required backend/release acceptance.
