# Complete local testing guide

Latest additions: [structured exam content](../structured-content-architecture-and-testing.md), [two-deployment setup](../combined-deployment-architecture-and-testing.md), and [coworker administrator setup](../coworker-school-administrator-guide.md).

Updated 24 October 2026. Start here to test the current Nexora frontend, school backend, owner backend and worker against local PostgreSQL. These are instructions and expected results, not a claim that every manual check has passed.

## Before you begin

For the latest eleven improvements, use the [staff assistance, enrollment, roster and review testing guide](../pending-features-architecture-and-testing.md).

- Use synthetic local test accounts and records. Do not use production credentials.
- Your manual data is saved in `nexora_manual_test` on `127.0.0.1:55432` and survives restarts. The automated suite uses the separate disposable `nexora_be02a_test` database.
- The guarded local launcher rejects hosted database connections. These instructions do not apply migrations to Supabase or deploy anything.
- AI-enabled uploads can send questions and answer keys to the configured external provider. Use invented test questions. Local database storage does not mean AI processing is offline.
- Use separate browser profiles for the administrator, teacher, student and invigilator. Tabs in one profile share login cookies and can replace each other's sessions. Keep a student's exam in its original browser.
- Use the private [local account list](../../../.local-test/LOCAL-TEST-ACCOUNTS.md). Never put passwords, QR codes, API keys or recovery secrets in a test report.

## Start the system

Open PowerShell. Run these commands in order, stopping if any command fails:

```powershell
cd "C:\Users\kaleab\Desktop\Nexora_Exam_Platform\exam-frontend"
node scripts/local-test.ts db
node scripts/local-test.ts migrate
npm --prefix nexora-backend run build
```

Then open four separate PowerShell terminals. In each, change to the same folder above and run **one** of these commands. Keep all four terminals open:

| Terminal | Command | Purpose |
| --- | --- | --- |
| 1 | `node scripts/local-test.ts backend` | School API |
| 2 | `node scripts/local-test.ts platform` | Owner API |
| 3 | `node scripts/local-test.ts worker` | Reads uploads and processes background work; expect `Worker ready` |
| 4 | `node scripts/local-test.ts frontend` | Portal website |

In another terminal, run `node scripts/local-doctor.ts`. Resolve missing migrations, unreachable services or worker school coverage before testing uploads. A provider key being present does not prove that provider works. Do not start duplicate copies of a service already running.

Open the [school portal](http://127.0.0.1:5183) or [owner portal](http://127.0.0.1:5183/platform). This must be the integrated local site, not the demo site. Stop application terminals with Ctrl+C; restart using the commands above. Do not delete database files to restart. If the database reports permission denied, preserve the output and investigate rather than repeatedly starting it or deleting its lock file.

## Follow this order

Each page includes expected results and links to deeper architecture details.

1. [Login, portal guides, layout and language](01-access-and-guidance.md)
2. [School setup, accounts, IDs, roster and assignments](02-school-and-accounts.md)
3. [Teacher authoring, uploads, AI, cancellation and review](03-authoring-and-ai.md)
4. [Approval, calendar, scheduling and invigilators](04-scheduling-and-invigilation.md)
5. [Student download, exam, privacy, assistance and submission](05-student-exam.md)
6. [Monitoring, results, recovery and practice](06-results-and-recovery.md)
7. [Platform owner and school isolation](07-platform-owner.md)
8. [Technical checks, workers, backups and deployment gates](08-technical-and-release.md)
9. [Record your results and report problems](TEST-RECORD.md)

Use steps 1–6 for one complete school rehearsal. Start with two classes in one grade, a subject, a teacher, a limited invigilator and at least three students. Use separate short sittings for normal completion, assistance/interruption and recovery; do not try every failure scenario on the same attempt. Allow enough preparation time to download and enough exam time to test before the original deadline.

## What counts as passing?

Mark each check **Pass**, **Fail**, **Blocked**, or **Not tested**. Record the account role, page, browser and expected/actual behavior. A missing prerequisite is Blocked, not Pass. Test the main journey with the real local backend; demo screenshots alone do not establish database correctness.

Some older feature documents retain historical limitations and superseded behavior. For current testing: IDs use `STU/SID/NNNN/YY` and `TCH/SID/NNNN`; results release automatically on authorized reads after the scheduled time and closed submission windows; staff approve assistance on their own devices; strict fullscreen is required by the current runner. The [local alignment record](../local-release-readiness.md) records migrations through 029 in both local databases. Always run the doctor against the checkout you are testing.

Hosted Supabase remains a separate later stage. Finish local testing and resolve failures before reviewing the hosted migration ledger, backup/restore, deployment and hosted acceptance plan.
