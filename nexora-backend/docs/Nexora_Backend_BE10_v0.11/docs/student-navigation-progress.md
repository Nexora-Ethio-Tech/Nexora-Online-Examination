# Student navigation and preparation progress

15 October 2026. Implements frontend audit F-01 and F-02. No endpoint, payload or backend behavior changes; API contract v0.10 remains current. These local progress steps do not acknowledge readiness to the administrator. The separate F-06 contract/workflow is still outstanding.

## What changed

- Official question navigation starts collapsed. Show/Hide question numbers exposes an accessible expanded state and controlled navigation region. Current question and answered/unanswered totals remain visible when collapsed.
- Previous/Next remain available independently. Expanding and collapsing do not change selections, saved answers, timer or submission behavior. Large lists scroll inside a bounded navigation area; buttons retain at least 44px targets.
- Preparation reports actual phases: availability, browser/attempt registration, download, checksum, local save and offline app verification. Completed, in-progress, stopped and not-started labels reflect which operation has been reached, without invented percentages.
- Failure preserves its phase and diagnostic, with Retry preparation while the schedule allows it. A retry starts again with availability checks and retained creation identifiers. Corrupt packages and failed storage/shell checks never produce a Ready claim. Cancellation after shell verification cannot return success.
- Demo mode explicitly labels offline app verification unavailable. Production Ready still requires the existing verified shell, valid checksum and local transaction.

## Rehearsal

Start `npm run dev:demo`. Sign in as DEMO-STUDENT with the public synthetic password `NexoraDemo!`. Open Mathematics immediately to inspect preparation before its short demo countdown ends. Download and inspect each phase; fast phases may complete too quickly to see individually, but their completion labels remain. Expect Encrypted paper saved, with offline verification unavailable in demo.

Return to My exams and open English while its window is active. Download to enter the runner. Answer a question, use Next question with the navigator collapsed, expand it, select the last question, collapse, use Previous, then expand and return to the answered question. Its saved answer and answered marker must remain. Review and confirm submission; wait for an actual demo receipt.

For a longer paper, follow math-20-demo-guide.md. The normal ten-minute preparation rule for teacher-created sittings is unchanged. Do not reload during the same-tab demo rehearsal: its simulated server resets.

## Verification

Automated coverage includes 200-question keyboard navigation, selected/answered state through collapse, checksum-failure display and retry, truthful demo shell status, storage failure stopping before shell verification, shell failure/retry using the same creation key, and cancellation before reporting success. An existing device-registration test now awaits asynchronous verification rather than reading its loading state as a failure.

Local headless Edge was exercised at 360x800: preparation, expanded/collapsed official runner, Previous/Next, saved-answer retention and final demo receipt passed. Screenshots of preparation and expanded navigation were inspected; no horizontal overflow was measured in any of those three states. Temporary screenshots are under ignored `tmp/`. This is a browser viewport check, not real Android, real-backend or production offline acceptance. The in-app browser tool could not initialize, so installed Edge was used.

`npm run check` passes type checking, lint, formatting and all 162 tests in 29 files. Production build passes with existing Zod annotation and large-chunk warnings. `git diff --check` passes. No new dependency was installed.
