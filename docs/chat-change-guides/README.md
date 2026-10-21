# Changes made in this chat and how to test them

Prepared 21 October 2026. This report covers the implementation range `845a8ea..ed01fe2`: **14 local commits** on `feat/verified-platform-development`. The documentation commit that adds this report is additional.

Repository: `C:\Users\kaleab\Desktop\Nexora_Exam_Platform\exam-frontend`. Backend: its `nexora-backend` folder. This is the checkout changed in this chat, not the other agent's `D:\Nexora` checkout.

## Start here

1. Run the local automated checks below. They use synthetic fixtures/mocks and do not apply migrations.
2. Read each change guide. Each numbered manual test states the expected result.
3. For full assistance, owner, backup, worker or load acceptance, arrange an **isolated staging database/deployment** with synthetic accounts. These features cannot all be accepted using frontend demo mode.
4. Record results with the supplied template. A successful build or mock test does not establish real database isolation, screenshot prevention or capacity.

Nothing in this chat was pushed or deployed. Migrations 022 and 023 were written but not applied. No production data changes or first-owner enrollment were performed. Do not run a migration bundle blindly: this checkout's historical migration 020 differs from the other agent's reported 020/021. Reconcile the actual target ledger and definitions first.

## Guides by change

- [School provisioning command](01-school-provisioning.md)
- [Multi-school workers and scheduler entry points](02-background-workers.md)
- [Encrypted application backup and restore](03-backup-and-restore.md)
- [Amharic review output and bundled Ethiopic fonts](04-amharic-and-fonts.md)
- [Real-API load-test harness](05-load-test-harness.md)
- [Hosting guidance and repository support changes](06-hosting-and-repository-support.md)
- [Student assistance pause and scoped staff approval](07-exam-assistance.md)
- [Isolated platform-owner portal](08-platform-owner.md)
- [Exam Privacy Shield](09-exam-privacy-shield.md)
- [Documentation history and scope corrections](10-documentation-and-scope.md)
- [Complete commit and changed-file inventory](COMMIT-FILE-INVENTORY.md)
- [Reusable test report](TEST-REPORT-TEMPLATE.md)

The owner guide itemizes its separate school, account, subscription, health, audit and authentication changes. The privacy guide itemizes all ten privacy commits. The inventory lists every touched file, including supporting configuration and tests.

## Local automated checks

Open PowerShell. Use the existing Node/npm installation compatible with this repository (Node 24 baseline). If dependencies are missing, run `npm ci` in each package first; installation requires network access.

```powershell
Set-Location 'C:\Users\kaleab\Desktop\Nexora_Exam_Platform\exam-frontend'
npm run check
npm run build

Set-Location 'C:\Users\kaleab\Desktop\Nexora_Exam_Platform\exam-frontend\nexora-backend'
npm run test:unit
npm run build
```

Stop and investigate any nonzero exit; do not continue as though it passed. Backend unit tests use doubles and do not prove migrations or production behavior.

For the synthetic desktop/mobile exam journey:

```powershell
Set-Location 'C:\Users\kaleab\Desktop\Nexora_Exam_Platform\exam-frontend'
npm run build
npx playwright test --project=demo-desktop --project=demo-mobile --grep "student answers offline"
```

The test starts local servers on 5178 and 4178; those ports must be available. If Playwright reports a missing browser, install its Chromium runtime with `npx playwright install chromium` and retry. This downloads a browser; it does not deploy the app.

For a manual synthetic UI demonstration, run `npm run dev:demo` from the repository root and open the printed local URL. Use only the demo credentials displayed in that UI. The demo does not implement full platform-owner or assistance approval acceptance.

## Verified results before this documentation task

| Check                                                    | Recorded result                  |
| -------------------------------------------------------- | -------------------------------- |
| Frontend typecheck, lint, formatting                     | Passed                           |
| Frontend unit/component tests                            | 210 passed                       |
| Release-source checks                                    | 9 passed                         |
| Backend unit tests                                       | 144 passed                       |
| School frontend and backend builds                       | Passed                           |
| Privacy desktop/mobile synthetic journeys                | 2 passed                         |
| Owner-only frontend build                                | Passed at the platform milestone |
| Real migrations, RLS/function execution and races        | Not performed                    |
| Live backup/restore, hosted worker and live AI quality   | Not performed                    |
| k6 capacity and physical-device/OS screenshot acceptance | Not performed                    |

Counts are historical evidence at the feature milestones, not a promise that every future run will pass. Build warnings for the main bundle size and dependency annotations were recorded.

## What we did not build in this chat

The pre-existing AI exam generator and immediate approved-package preparation were baseline features. They were not newly created by these 14 commits. The other agent's Ethiopian calendar, question-bank documents, anti-cheating claims and other reported work were not automatically copied or certified. No universal screenshot blocker, new invigilator role, payment processor or HahuCloud deployment was added.

The pre-existing deletion of `nexora-backend/.env.example` was left untouched and excluded from our commits.
