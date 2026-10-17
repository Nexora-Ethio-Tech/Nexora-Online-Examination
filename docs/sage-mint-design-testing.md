# Sage and mint design review

16 October 2026 · refined on feat/quiet-sharp-ui after design commit 91dd77a.

## Scope

Screenshots supplied by the project owner inspired the visual treatment. Existing exam, role, approval, recovery, credential and timing rules remain authoritative. This update adds no backend endpoints, dependencies, migrations, grading rules or timing changes.

Shared palette: sage #A2C1A0 (form borders and accents), mint #C6E9D3 (selected navigation and answered questions), near-white #F7F9F7 (workspace), forest #203E30 / #244B37 (navigation and primary actions), white cards. Amber/red still identify attention and error states with readable text. System Georgia headings and the existing locally bundled Geist body font need no external font service.

## Visual refinement

The follow-up removes decorative wave banners and surface shadows, reduces shared corner radii to 2px, flattens monitoring/results counts and exam navigation/save feedback, and replaces multicolour paper badges with simple icon-and-text statuses. Repeated page-purpose, sidebar timezone and review-marker explanations were removed. Schedule timezone labels, deadlines, instructions, save evidence and actionable warnings remain available.

## Manual review

Run npm run dev:demo in the repository. Use the existing demo credentials shown on the login page.

1. Sign in as student, teacher and administrator. Check forest navigation, white cards, readable selected links, quiet backgrounds and sharp corners, account menu and logout. Roles remain explicitly labelled.
2. At 360px width, open Navigation, choose a page and close/reopen the drawer by keyboard. Increase browser text size to 200%; header controls must wrap rather than overlap. Check horizontal overflow and visible focus outlines.
3. Student My exams groups loaded papers into Preparing and open, Needs attention, Upcoming and Past exams. A submitted paper stays in Past exams even if its sitting is still open. Pending upload/recovery stays under Needs attention. Pagination remains available; these groups do not claim school-wide totals.
4. Open preparation. Check prominent countdown, unchanged EAT labels and actual download/check states. No skip-wait button or simulated download percentage has been added.
5. Start the current-window exam. Workspace navigation/account menu must disappear. Question numbers must be visible above the question by default. Current is filled, answered includes a check, and marked questions show a flag/outline. Hide/Show retains the current question and answers.
6. Expand Review filter to filter marked questions. Expand Instructions and browser controls to read instructions, request fullscreen or leave via the existing route guard. These disclosures never change saved answers or deadlines.
7. Verify save feedback, offline indication and timer readability. Answer, navigate, mark for review, go offline, reconnect and submit. Confirm receipt-backed success still works. Supervision behavior remains as documented in browser-controls-testing.md.
8. Teacher papers use responsive cards and status badges. Open a paper and use numbered Details, Upload and Review tabs. Verify the upload, review and submission flows.
9. Administrator approvals use the same cards/status language. School forms, recovery decisions and monitoring retain their existing controls. Check selected tab contrast and readable status counts.
10. Results show finalized-result/status-row/topic counts from the report, score-distribution columns, topic bars and exact data tables. Check CSV export and printing. No sample average, pass rate or student count was invented from the design references.

## Backend handoff

No new backend work is required for this visual update. Continue the outstanding real integration checks and browser-supervision migration from backend-browser-controls-task.md. Do not interpret local demo screenshots as proof of live database integration.

## Verification

Verified locally for the refinement: npm run check passed (TypeScript, lint, formatting, 192 frontend tests and 9 release-source tests); npm run build passed. The browser suite passed 25 of 26 journeys initially: the desktop authoring-to-admin journey timed out with an empty demo list after switching roles. That unchanged journey passed both targeted repeat runs. Its cause was not established; the demo stores papers in memory and documentation was edited during the initial dev-server run. No assertions or accessibility rules were weakened. Desktop monitor and mobile active-exam screenshots were visually reviewed. Browser coverage includes desktop, 360px mobile, landscape, contrast, keyboard access and existing exam/approval/recovery workflows. No deployment or push is part of this change.
