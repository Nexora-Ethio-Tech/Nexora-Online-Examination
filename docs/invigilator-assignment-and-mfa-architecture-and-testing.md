# Invigilator assignment and private authenticator setup

Implemented 23 October 2026. This extends the existing assistance workflow and supersedes the earlier guide's teacher-only assignment and operator-only first enrollment rules.

## What changed

- School setup → Accounts → Invigilators creates a non-teaching staff account using the same name, credential issue, edit, deactivate, and retention controls as other accounts.
- Its `/invigilator` portal offers exam assistance only. Teaching, student, school management, and results APIs retain their existing role restrictions.
- After saving preparation/start/end/results dates, each exam sitting displays **Assign invigilators**. Teachers, school administrators, and limited invigilators from the same school can be assigned. A reason and current revision are required for changes.
- Staff may be assigned before authenticator setup, with readiness shown to the administrator. Approval still requires confirmed MFA. School administrators retain school-wide assistance access even without an explicit assignment.
- Teachers and invigilators can complete first-time authenticator enrollment on their own assistance page. Administrators and replacement of existing authenticators still use protected operator recovery.
- A student reaching the five-interruption UI lock can explicitly select **Request invigilator help**. This uses the existing server assistance request, pauses editing, and preserves the original deadline and saved answers. Approval enables reopening the exam; it does not lift an administrative suspension.
- Onboarding describes account creation, assignment, and private MFA setup.

## Architecture and security boundaries

Migration `026_invigilator_role.sql` extends the existing PostgreSQL TEXT role constraint. It does not create a platform-owner role or grant tenant bypass. Existing sitting assignments and assistance tables from migration 022 are reused.

Staff setup endpoints are GET `/assistance/authenticator`, POST `/assistance/authenticator/setup`, and POST `/assistance/authenticator/confirm`. They use the current authenticated school/user, CSRF protection, active-account checks, persistent rate limits, password verification, five-minute pending enrollment, authenticated encryption, row locking, one-time TOTP consumption, and secret-free audit events. Status never returns a secret. Setup responses are `no-store`.

The QR image is generated locally using pinned `qrcode` 1.5.4. Password, key, QR and confirmation code remain in component memory, outside query/mutation caches and browser storage. Hiding setup removes the visible key; the encrypted pending enrollment expires server-side after five minutes. Existing factors cannot be replaced through this screen.

Unlike the supplied reference, the administrator cannot retrieve staff QR codes, secrets, or live codes. Staff enter their own code on their own authenticated device. Approvals do not prove physical presence, stop the exam timer, or override suspension. No automatic server penalty was introduced. The existing strict shield's five-event lock remains client-side, with its previously documented reload limitation.

## Test in this order

Use the isolated local test environment, never production credentials or production Supabase. Apply all pending migrations through 026 to a disposable database first; do not apply only 026 to an older schema.

1. **Administrator — create staff.** School setup → Accounts → Invigilators → Add invigilator. Enter names and reason, save the issued credentials privately. Confirm edit/deactivation controls work. A limited invigilator must not appear as an eligible teaching-assignment teacher.
2. **Administrator — assign.** Approve an exam and save its preparation, start, end and results dates. Immediately below its saved dates, enter an assignment reason and assign the invigilator. Confirm “Authenticator setup needed.” Assign a teacher too; revoke and reassign to check revision handling. Other schools' staff must never appear.
3. **Invigilator — enroll.** Sign in separately with the new credentials. Open Your authenticator, confirm the password, scan the QR using Microsoft Authenticator → Other account, and confirm the six-digit code. Wait for the next code before approving help. Refresh: the screen should say ready and must not reveal the key again. Test wrong password, wrong code, expiry and replay rejection using disposable accounts.
4. **Authorization.** Invigilator URLs for teacher authoring or school administration should return to the limited portal; direct protected API calls must be rejected. Unassigned invigilators cannot inspect or approve another sitting. Deactivated/revoked staff lose access. Administrators retain their documented school-wide access.
5. **Student — request help.** Start an eligible exam, save an answer, and request assistance. For the strict-lock route, generate five distinct interruption/resume episodes and select Request invigilator help. Questions stay unavailable while waiting; the exam deadline continues. If sending fails, preserve the browser and reconnect before retrying.
6. **Invigilator — approve.** Choose the assigned sitting in Exam assistance, refresh requests, verify the student's identity and request, enter the reason and a fresh authenticator code, and approve. Reusing the same code, approving an expired request, or acting after assignment revocation must fail.
7. **Student — resume.** Wait for status refresh, choose Try opening exam again, and enter fullscreen. Verify the saved answer and original deadline. A suspended or closed exam must remain blocked. Repeat with rejection, network loss, and duplicate approval requests.
8. **Mobile and recovery.** Check the QR/setup form and request inbox on a narrow screen. Use protected operator recovery for lost authenticators; do not share another staff member's factor or enter staff codes on student devices.

## Automated verification and remaining gates

Frontend typecheck, lint, formatting, 256 tests and 14 tooling checks passed. Frontend and backend builds passed; 200 backend unit tests passed. Assignment after scheduling passed in Chromium at desktop, mobile and landscape sizes. The production mobile QR enrollment/accessibility test passed after correcting a nested main landmark. All four targeted browser cases passed across the initial run and focused rerun. The isolated database attempt failed at connection setup (127.0.0.1:55432); no database integration success is claimed. A migration-026 role acceptance case has been added for the next database run.

Demo supports account and assignment UI checks, but does not simulate real MFA enrollment or assistance decisions. The mobile production-build browser test uses intercepted API fixtures; it verifies the real QR renderer and UI, not PostgreSQL or real authenticator acceptance.

**Deployment gate:** migration 026 and database-backed authorization/enrollment/assistance flows still require validation on an isolated PostgreSQL database. The bundled local PostgreSQL executable has been blocked by Windows Application Control and the configured local port has refused connections. Do not substitute hosted production Supabase. Existing pending migration acceptance requirements remain in force.
