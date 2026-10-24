# Nexora local test record

[Testing home](README.md)

Copy this template into a private test report. Do not overwrite the blank template with real credentials or student information.

## Run information

- Date/time (EAT):
- Git commit:
- Tester:
- Browser/version and viewport/device:
- Site URL:
- Database name/host/port (no password or connection string):
- Migration ledger checked by:
- Backend, owner API and worker running:
- Account roles used (no passwords/MFA secrets):

## Checklist results

Use Pass / Fail / Blocked / Not tested. Reference numbered checks, for example `03.5` means authoring guide, queued cancellation. Add rows as needed.

| Check | Status | Expected result | Actual result | Evidence/issue |
| --- | --- | --- | --- | --- |
| 01.1 | Not tested | Correct role login/logout | | |
| 02.4 | Not tested | Roster accounts grouped in their class | | |
| 03.2 | Not tested | Correct questions parsed | | |
| 04.10 | Not tested | Invigilator assigned to correct sitting | | |
| 05.10 | Not tested | Assistance preserves answer and deadline | | |
| 06.7 | Not tested | Results available at eligible release | | |
| 07.9 | Not tested | Schools remain isolated | | |
| 08.1 | Not tested | Local migration ledger aligned | | |

## One issue per report

- Short title:
- Guide/check number:
- Role and page:
- Synthetic record reference:
- Steps to reproduce:
  1.
  2.
  3.
- Expected:
- Actual:
- Happens every time or intermittently:
- First noticed time (EAT):
- Screenshot or redacted error:
- Does it block the exam, lose answers, expose another school's data, or only affect appearance?
- Developer fix/commit:
- Retest result:

Keep failed exam tabs and pending answers intact. Do not clear storage/delete the database to hide a failure. Redact passwords, credential downloads, QR images, authenticator keys/codes, cookies and API keys from evidence.

## Completion summary

- Passed checks:
- Failed checks:
- Blocked/not-tested checks and reasons:
- Automated commands/results:
- Physical-device/AI/backup/load checks still outstanding:
- Safe to continue local testing:
- Hosted release approval: **Not granted by this checklist. Requires a separate decision.**
