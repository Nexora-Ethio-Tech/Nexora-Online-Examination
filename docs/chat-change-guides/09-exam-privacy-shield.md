# Exam Privacy Shield

Verified change history through `ed01fe2`, 21 October 2026. Commit(s): 40ae883 through ed01fe2 (10 commits).

## Precisely what changed

- Added display-layer concealment for blur, hidden visibility, pagehide and beforeprint; a focused/visible page plus explicit Resume is required.
- Kept the question subtree mounted while hidden. The engine, saved answers, outbox, deadline and staff authorization remain independent.
- Replaced the student-login watermark with repeated attempt reference and UTC device timestamp.
- Added exam-scoped print CSS that hides application content and prints a notice. Other routes retain their existing report printing.
- Added durable focus_lost telemetry and backend/client enum support; events are not labelled screenshots and cause no automatic penalties.
- Added component, integrity, backend and desktop/mobile browser tests and architecture/testing guides. Clipboard wiping, DevTools blocking and native capture exclusion were not implemented.

## How to test

Read [setup and common checks](README.md) first. Backend commands run inside `nexora-backend`; browser/k6 and Git commands run from the repository root.

```powershell
npm run build
npx playwright test --project=demo-desktop --project=demo-mobile --grep "student answers offline"
```

1. Run the local synthetic browser command below from the repository root. It starts its own local demo/preview servers.
2. Open a synthetic active exam, answer a question, switch tabs/apps and return. Expect concealment until Resume; saved answers and time must remain intact.
3. Repeat offline and while saving; reconnect and submit. Verify exact answers and a real committed receipt on staging.
4. Use print preview via Ctrl+P and browser menu. Expect a notice without questions; cancelling requires Resume. Verify report printing on an authorized report route.
5. Check watermark contains no login/name. Verify focus_lost appears as an interruption, never proof of a screenshot.
6. While hidden, have staff suspend the attempt or pause it for assistance. Resume must not bypass revalidation/approval.
7. Try Windows capture tools and recording. Record separately whether the shield appeared and what was captured. Some captures may contain questions; that remains a documented browser limitation.

## Evidence and remaining limits

Two synthetic desktop/mobile journeys passed. Real OS-capture, print-dialog, live-database and physical-device acceptance remain pending. Deploy compatible backend/client event schemas together.

See the [detailed implementation guide](../exam-privacy-shield-testing.md) and [exact commit/file inventory](COMMIT-FILE-INVENTORY.md). Record actual results using the [test report template](TEST-REPORT-TEMPLATE.md); do not mark unperformed checks as passed.
