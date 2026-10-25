# Pending features: architecture and testing guide

Implemented locally on 25 October 2026. This guide covers the six school-management changes and five staff/security/review changes requested together. Hosted Supabase is unchanged. Local commits only.

## Start and test in this order

Use the existing [launch and account guide](testing/README.md). Start PostgreSQL, the school backend, the owner backend, the frontend and the worker. Restart backend/worker processes after rebuilding. Use local test accounts, not production credentials.

1. [School code and administrator information](#school-code-and-administrator-information)
2. [Administrator authenticator invitation](#administrator-authenticator-invitation)
3. [Student roster](#student-roster)
4. [Automatic worker coverage](#automatic-worker-coverage)
5. [Invigilator assignment](#invigilator-assignment)
6. [One staff authenticator and combined inbox](#one-staff-authenticator-and-combined-inbox)
7. [Assistance report](#assistance-report)
8. [First-interruption approval and fullscreen hover](#first-interruption-approval-and-fullscreen-hover)
9. [Compact question review](#compact-question-review)

## School code and administrator information

School numbers already come from the database sequence. Owner directory responses now expose a minimum-three-digit school code. It is visible on school cards and the selected school panel; it is not editable. Numbers beyond 999 retain every digit.

Provisioning and adding administrators require first name, father's name, grandfather's name, phone and recovery email. Display names are assembled on the server. Edit administrator information is a separate owner action, with a reason, fresh owner MFA and revision checking. Contact details are not treated as verified recovery identity automatically.

Test: create a school, record its code, reload and confirm the code stays unchanged. Add an administrator with all five profile fields. Load administrators under Edit administrator information and update a field. Check persistence after reload. Submit an invalid phone/email and confirm rejection. Two editors updating the same revision must not silently overwrite each other.

Migration 031 adds profile/roll columns and narrowly granted profile update access. Runtime school data remains tenant-scoped. The platform role does not receive access to password hashes or MFA secrets.

## Administrator authenticator invitation

Creating a school/administrator, or explicitly resetting administrator MFA after identity verification, returns a private invitation once. The link contains a random token in the URL fragment, not a query parameter. Only a SHA-256 token hash is stored. It expires in 30 minutes; replacement invalidates earlier invitations. Passwords, tokens and QR secrets never enter operation replay records or query caches.

The administrator opens the link, enters the actual login ID and initial password, scans the QR code or enters the setup key, and confirms a six-digit code. The account is activated only after confirmation. An enrolled account cannot use the invitation to replace its factor. The setup page removes the fragment from the address bar and keeps secrets in component memory. A reload requires reopening the original invitation. The QR setup also has its own short expiry.

Test: use a newly created administrator, not an existing active account. Wrong password must fail. Correct credentials reveal a QR/key. Confirm from Microsoft Authenticator and then sign in with a fresh code. Reusing the invitation must fail. Verify an expired link fails. A lost creation response requires an explicit owner recovery action; replay does not reveal credentials again.

Migration 032 stores invitations with forced RLS and a restricted hash-lookup function. Enrollment endpoints use the existing Origin/CSRF protection, per-IP and per-token rate limits, encrypted MFA secrets and consumed-step protection.

## Student roster

Download the new Excel example from School setup → Roster import. The Students worksheet contains these columns, in order:

| Roll number | First name | Father's name | Grandfather's name |
| --- | --- | --- | --- |
| Optional | Required | Required | Required |

The roll column may be blank or removed entirely. Select the destination class in the portal. Nexora generates the student login ID using the existing school-wide number allocation and Ethiopian year. Generate credentials through the existing explicit private distribution action. No imported column supplies the login ID or password.

The XLSX parser rejects formulas, macros, external relationships and unsupported embedded objects. CSV with matching headers is supported. Existing legacy two-column CSV imports remain readable for compatibility; their reference is still not a login ID.

A roll number is a class-scoped duplicate-detection reference. Without one, repeating the exact file and row is detected. A changed file without roll numbers may contain existing students; check Accounts before importing it. Matching names are never automatically merged because two students can have the same names.

Test: preview/import the downloaded example, including its blank roll cell. Check the three stored names and generated STU/SID/NNNN/YY ID. Repeat the same file and confirm duplicate errors. Import a three-column CSV without roll number. Try the same roll in a different class and verify separate generated IDs. A missing name must block commitment. A malformed file must create no accounts. Demo mode supports the supplied Excel example and CSV; arbitrary Excel files require the real backend.

## Automatic worker coverage

Migration 030 provides a SECURITY DEFINER function exposing at most two active-school IDs after a cursor. The worker processes one school per sweep and uses the second ID to decide whether another page exists. Every actual import/package operation remains tenant-scoped and uses existing leases. The next sweep cycle discovers new active schools without process restart. No WORKER_SCHOOL_IDS configuration is required. Explicit trusted --school operation remains available.

Test: leave the worker running, create a new school, upload a valid exam under it, and verify parsing, AI review and package preparation. Suspended schools must not be processed. Provider quota/network failures are separate from discovery and can still require retry.

## Invigilator assignment

Assign invigilator and Revoke assignment open a dialog. The initial button does not depend on a reason field. Enter a reason and confirm inside the dialog. Existing backend authorization, assignment revision checking and audit remain intact.

Test: click Assign with no earlier reason. Confirm must remain disabled until a reason is entered. Cancel must make no change. Confirm and reload. Repeat with Revoke. Only staff from the same school may be assigned.

## One staff authenticator and combined inbox

MFA remains account-level. Teachers and non-teaching invigilators enroll once and use the same phone entry for all assigned exams. Enrolled staff see Authenticator connected. Replacement still requires verified recovery.

The inbox defaults to all authorized pending requests. Exam selection is an optional filter. Cards identify the student and exam. Teachers/invigilators see assigned sittings only; school administrators retain school-wide assistance access. Pending inbox responses are bounded to 200 requests and refresh as requests are handled; this is not a capacity claim.

Test: assign the same teacher to two exams. Enroll once. Create a student request in each and verify both appear without selecting an exam. Filter to one exam, then return to All assigned exams. An unassigned teacher must not see or decide the requests.

## Assistance report

School administrators see Staff assistance history below the inbox. Each recorded approval/rejection or failed authenticator verification includes staff identity/role, student identity/login ID, exam/sitting, interruption kind, request time, decision/check time, reason and outcome. Times use the shared Ethiopian calendar/EAT formatter. Totals group by staff, student, exam and outcome. History uses server-time ordering with a bounded page and More history.

Incorrect/expired and already-used codes leave the pause intact and record a failed check in a committed transaction. Actual codes and secrets are never recorded. Requests rejected before authorized request lookup (malformed, unauthorized or rate-limited requests) are not presented as student assistance decisions. Repeating an already committed identical decision is idempotent and does not duplicate the approval.

Test: submit one wrong code, then a valid fresh code. Confirm separate failed and approved entries and totals. Reuse that code on a second interruption: it must fail. Wait for a new code, approve and confirm the new entry. Teachers/students cannot read this administrative report.

Migration 033 records the request's interruption kind and indexes assistance audit history.

## First-interruption approval and fullscreen hover

The first qualifying interruption hides the paper and stops editing. The engine records evidence and a stable assistance-request identity in the identity/version/device-bound IndexedDB attempt. It sends an idempotent request that sets the existing server assistance pause. Repeated browser events while already blocked do not create new episodes. Backend unlock/save gates continue to enforce the pause until authorized staff approval. Offline requests remain locally locked and are retried after reconnecting or reopening; offline reload never enables editing. Saved answers and the original deadline remain intact.

A fresh staff authenticator code is required for each new approval. There is no five-interruption allowance. These events are security interruptions, not confirmed cheating and not automatic disqualification.

Pointer movement or mouseleave alone no longer triggers the shield. Actual fullscreen exit, genuine focus/visibility loss and the existing restricted shortcuts/tamper triggers still do. Browser privacy measures do not guarantee screenshot prevention.

Test on actual Windows Chrome and Edge:

1. Enter fullscreen and answer a question. Hover near the top-center exit X without clicking: no assistance request or lock should appear.
2. Click X or leave fullscreen with Escape: editing must lock on the first event.
3. Switch tabs and return: staff approval is still required. Multiple events from one exit must produce one pending request.
4. Approve from the assigned staff member's own device using fresh MFA. Reopen the student exam and confirm answers/deadline remain unchanged.
5. Disconnect, trigger an interruption, reconnect/reload and verify it cannot bypass approval.
6. Verify a second interruption needs another approval. Previously used codes cannot authorize it.
7. Check deadline expiry while paused and retain any final/recovery evidence.

Automated DOM events do not establish native browser-control behavior. Physical fullscreen hover and phone authenticator scanning remain manual checks.

## Compact question review

One question editor is visible at a time. Numbered buttons jump between questions; green with a checkmark means reviewed, amber with a warning label means flagged, and neutral means not reviewed. Previous/Next, Save question review, Save and next and the bulk non-flagged confirmation remain available. Next alone never marks a question reviewed. Dirty edits prevent accidental navigation.

Test at desktop and 360px width: open a question, edit it, verify navigation is blocked until saved, save and move to the next question, and confirm reviewed/flagged colors and text. Bulk-confirm eligible questions and verify unresolved warnings remain. No narrow multi-column editing table should appear.

## Verification record

Verified 25 October 2026: 286 frontend tests, 17 tooling tests, 218 backend unit tests, 28 local integration tests and six desktop/mobile browser checks passed. Frontend/backend builds passed. Migrations 030–033 applied to nexora_be02a_test and nexora_manual_test on local PostgreSQL. Restart school backend, owner backend and worker. Physical Windows fullscreen hover and phone scanning remain manual checks. No push, deployment or hosted database modification is included in this task.
