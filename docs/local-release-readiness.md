# Local release rehearsal and testing order

24 October 2026. This is the current local alignment record; older guides retain their historical test results. Nothing has been pushed or deployed by this task.

## What is aligned

- Persistent manual database and disposable automated database have every migration in the checkout through **029**. Migration 028 adds account numbering; 029 lets the restricted owner service read the current import lifecycle. Existing local accounts and records were preserved.
- The school API, separate owner API and import worker use validated loopback database settings. The frontend uses the real API, with mocks disabled.
- Automatic scheduled results, immutable earlier snapshots, corrected results after recovery and practice are exercised by the real HTTP/browser suite. Older test expectations requiring manual publication were replaced with assertions for the approved automatic behavior, including before-release hiding and repeat-read idempotence.
- Real SQL list tests cover student category/title queries, teacher active/approved papers and admin pending/approved/class filters. Legacy test fixtures without authoring assignment IDs are not mistaken for papers created through the authoring API.
- Owner queue health now reads `import_jobs.state`; other queues retain their actual status columns. The query was verified with the restricted local platform role.
- Vercel configuration now recognizes invigilator and platform deep links and supports a separate owner API proxy. Configuration tests cover missing targets, insecure origins, proxy loops and API routing ahead of page fallback. Hosted behavior remains a separate deployment check.

## Start or restart locally

Open PowerShell in `C:\Users\kaleab\Desktop\Nexora_Exam_Platform\exam-frontend`.

```powershell
node scripts/local-test.ts db
node scripts/local-test.ts migrate
npm --prefix nexora-backend run build
```

`db` now recognizes an already-running instance. `migrate` updates only `nexora_manual_test`; it cannot select the hosted database. Re-running migrations skips the already-applied ledger entries. Do not delete the database to restart it.

Run each service in its own terminal and keep it open:

```powershell
node scripts/local-test.ts backend
node scripts/local-test.ts platform
node scripts/local-test.ts worker
node scripts/local-test.ts frontend
```

Use **http://127.0.0.1:5183** for the school portal and **http://127.0.0.1:5183/platform** for the owner portal. Use the existing private local test credentials, not production credentials. Your entered data stays in the persistent manual database. The worker processes authorized imports in configured local schools; keep it running during uploads.

Check the setup from another terminal:

```powershell
node scripts/local-doctor.ts
```

The doctor checks migration alignment, worker school coverage, provider-key presence and HTTP/proxy responses without printing credentials. Anonymous API responses of **401 are expected**. Key presence does not prove a provider works, and the doctor does not claim the worker process is running merely from its configured scope.

## Test the product in this order

1. **School setup, roster and teacher accounts:** [account IDs and passwords](account-ids-and-passwords.md), then [grade directory](grade-directory-architecture-and-testing.md).
2. **Teacher upload, parsing and AI explanations:** [import recovery and AI](import-worker-recovery-and-ai-testing.md), then [question review](question-review-usability.md). Groq passed a live synthetic check. Check the provider status in the handoff before relying on Gemini fallback.
3. **Lists, approval and scheduling:** [organized portals](organized-exam-portals.md), then [date controls and scheduling](compact-calendar-and-exam-categories.md). Include preparation duration zero and ten minutes, and extra-time students.
4. **Invigilators and student assistance:** [assignment and private MFA](invigilator-assignment-and-mfa-architecture-and-testing.md). Assign staff before starting the sitting; verify the student's deadline is unchanged by assistance.
5. **Student exam, interrupted work and privacy:** [privacy testing](exam-privacy-shield-testing.md), [supplied shield integration](supplied-security-shield-integration.md), and [factual incident reporting](factual-activity-reporting.md). Physical OS capture and device/network behavior still need human tests; browser events are not proof of cheating.
6. **Results, recovery and practice:** [automatic results and grouped history](automatic-results-and-grouped-history.md). Confirm results are hidden before their date and corrected after accepted recovery without overwriting the earlier snapshot.
7. **Owner portal and onboarding:** [owner architecture/testing](platform-owner-architecture-and-testing.md) and [resumable guidance](resumable-guides-and-owner-portal.md). Confirm school isolation and restricted owner operations.

Record any issue with role, page, action, expected result, actual result and screenshot. Never include passwords, API keys or authenticator setup secrets.

## Repeat automated verification

```powershell
node scripts/local-test.ts migrate-test
node scripts/local-test.ts test
npm --prefix nexora-backend run test:unit
npm run check
npm run build
```

Automated integration uses `nexora_be02a_test` and browser port 5184, not your manual database or port 5183. It creates and removes its own fixtures. AI in that integration suite is synthetic; the separate provider probe sends only a synthetic arithmetic question.

Verified in this alignment run: **25 real database/API/browser tests**, **214 backend unit tests**, and backend production/test-source compilation. Frontend typecheck, lint, formatting, 272 frontend tests and 17 tooling checks passed; the frontend production build passed. This is not certification of production infrastructure, backup restoration, 500-student capacity or every physical-device behavior.

See [deployment developer handoff](deployment-developer-handoff.md) for work requiring hosting/operator access and the release gate.
