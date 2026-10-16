# Student practice and administrator release

This increment adds **Practice release** for administrators and **Practice** for students. It implements the master plan's separate practice mode: first-answer feedback, reviewed explanations, repeated attempts and a maximum completed practice score. Official exam marks, ranks, publications and reports stay unchanged. Backend requirements are issued in BE-07 under API contract v0.8.

## How it works

An administrator selects an approved paper in Practice release, sets Enable practice and its EAT release date/time, enters a reason, confirms the review and saves. The page lists every remaining release blocker and retains settings history. Enabling can be scheduled in advance; practice opens only after the release time, official result publication for every related cohort and closure of all related submission windows, including extra time. A planned result date alone is insufficient.

Once practice has been released, its questions and explanations may have been seen. That paper can no longer be scheduled for another official sitting, including after disabling practice. Disabling stops further practice access and preserves previous attempts/best scores. If practice is enabled but not yet released, disable it before changing official schedules.

Students see eligible papers and reasons for locked access. Start new practice creates a separate attempt; Resume practice continues the most recent unfinished one. Choose an answer, then Check answer. Feedback shows correctness, marks, the correct answer and the approved explanation only after the server records that first answer. The answer is then locked for that attempt. Navigate through all questions and click Complete practice to record the score. Starting again returns to question one. Unfinished attempts never count toward the best score; a lower completed score cannot replace a higher one.

Practice is untimed and requires a connection for answer checks and completion. After a lost response, Retry same answer resends the retained value/key; the backend must enforce first-answer immutability. Refresh practice attempt reconciles current state. Practice has no offline-save promise. Official exams retain their separate encrypted/offline/receipt workflow.

The student's Official results page shows Best practice separately and offers Open practice when released. No practice marks enter official reports or rankings.

## Demo walkthrough

Run `npm run dev:demo` and use the README's synthetic accounts. Keep the same tab open and switch roles with Sign out / Sign in; a full reload resets the in-memory backend.

For a paper you already created: finish its official sitting, then sign in as DEMO-ADMIN, open Official results and approve publication with an arrived release time. All related sittings and submission windows must be closed. Open Practice release, enable that paper, set an arrived EAT time, enter a reason, confirm and save. Sign out, sign in as DEMO-STUDENT, open Practice and complete both questions. Repeat with different answers and check that Best practice retains the highest completed score.

A quick synthetic route is also available using the existing recovery example: DEMO-ADMIN → Recovery review → Load synthetic recovery example → accept the retained upload with a reason → Official results → approve publication for that example with an arrived release time → Practice release → enable that same example with an arrived time. Its official sitting is already closed. Then switch to DEMO-STUDENT and open Practice. This example is explicitly synthetic and does not validate production recovery or release behavior. Do not add demo example endpoints to the real backend.

The built-in Mathematics/English introductory schedules are separate runner fixtures; use a teacher-authored approved paper or the explicitly loaded recovery example for the shared results/practice flow. Admin practice settings refresh every 15 seconds, and student paper lists also refresh every 15 seconds; Refresh buttons request current server state immediately.

## Verification and limitations

Practice-specific automated tests cover release boundaries, all related sittings and accommodated acceptance windows, locked payload privacy, role/ownership/version/invalidation checks, pagination, first-answer immutability, lost-response replay, incomplete completion, repeated/abandoned attempts, maximum recomputation, duplicate completion, revocation and safe official scheduling. Component tests exercise admin confirmation, locked student screens, answer feedback/completion/new-attempt navigation and exact retries after a lost response. These tests use the development simulator and jsdom.

Verification for this increment: `npm run check` passed all 120 tests across 22 files, including 13 new practice tests; `npm run build` passed. The first full run exposed an existing teacher test that could match a transient list heading before detail navigation; targeting the detail's level-one heading fixed the assertion without changing product behavior. Existing build warnings remain for the main bundle size and Zod comment annotations.

The in-app browser walkthrough used the real demo UI to sign in with administrator MFA, accept the explicitly synthetic recovery example, approve its result publication, enable practice, switch to the student and complete two attempts at 50% and 100%. It verified locked first-answer feedback, new-attempt navigation at question one, two completed attempts with best 100%, and a separate unchanged official mark/rank. A 360px viewport check found no horizontal overflow and visually verified the completed practice screen; the temporary viewport override was reset. Local screenshots are in `tmp/practice-mobile.jpg` and `tmp/practice-results.jpg` (ignored verification artifacts).

No real backend/database, actual Android device, physical network interruption or 500-student load acceptance is established. The in-memory simulator has one synthetic school/student and cannot prove production tenant isolation or concurrent database transactions. Backend BE-07 specifies those mandatory tests. The current local demo server runs at http://127.0.0.1:5173/ while its development process remains active.
