# Group 2 design changes: testing guide

Branch: `feat/workspace-design`. Based on `origin/main` at `e422248`, which already includes the backend merge. These changes implement the approved design suggestions; they do not certify backend integration.

## Start the local demonstration

From the repository folder run `npm run dev:demo`, then open the URL printed in the terminal. Use `DEMO-STUDENT`, `DEMO-TEACHER`, or `DEMO-ADMIN` with password `NexoraDemo!`. The demo administrator code is `123456`. Demo credentials are for local simulation only.

## Navigation and account menu

- At desktop widths (1024px and above), use the left sidebar. The current page is highlighted. Students see My exams, Official results and Practice first; replacement-browser registration is under Help and devices.
- On phones and smaller windows, press the menu icon at the upper left. Choose a page to close the drawer. Escape or Close dismisses it and restores focus to its trigger. Test at 360px width, landscape, keyboard-only and enlarged text.
- Open Account (or your name on a wider screen) at the upper right. Check name, role and school, then Sign out. A failed server logout must show an error and leave the session visible.
- Inside an official attempt the workspace sidebar and account menu are hidden. Back to my exams uses the existing leave confirmation; it must not silently discard saved answers or extend the timer.

## Student exam and review reminders

1. Open English / current window in the demo and prepare it. Answer one question, then press Mark for review.
2. Open question numbers: the question has a flag icon and an accessible marked-for-review label. Show marked for review only filters the numbers, not the paper or answered count. Previous/Next still traverse the whole paper.
3. Move away and return; the answer and flag must remain. Reopen while online to revalidate; the flag survives. Offline reload still needs online revalidation before editing.
4. Remove the flag, or submit with it still marked. Flags are personal reminders, never answer changes, teacher review flags or penalties. They are device-local and do not transfer to a replacement browser.
5. Submit while offline: show Pending upload, not success. Reconnect and retry. Only a matching receipt produces the green check, Submitted successfully, receipt ID and accepted time. School review pending remains distinct.
6. Pending work must remain in browser storage; cleanup is still disabled.

## Teacher review

1. Create a draft and upload the unchanged downloadable Word/Excel example, or the unchanged 20-question mathematics demo.
2. Open Review questions. Check the overview table (question, answer key, topic, explanation, status), review progress and All / Needs review / Flagged / Reviewed filters.
3. Review the selected question, tick its confirmation, then Save and next. Only after server success should the next question needing review open. No question is automatically marked reviewed.
4. Try Save and next on a flagged question without a resolution note. The error must remain on that question. Add the note and save.
5. Edit a question without saving: switching questions and filters is disabled, and leaving the page still warns about unsaved edits.
6. After all reviews are saved, Submit for approval opens a final confirmation. Keep reviewing cancels. Confirm send for approval submits and locks the paper as before.
7. Flagged means a source review flag exists; resolving it does not erase its provenance from this filter.

## Refresh and timing

- Refresh exams, practice, results, school lists, recovery or an admin paper. The button shows progress and reports success even if the data did not change. Disconnect and retry: show failure without claiming old data is fresh.
- Check Last successful update in EAT. Monitor retains its existing server-time/staleness display; preparation retains its schedule-specific refresh feedback.
- Exam cards, scheduled preparation and practice release show days/hours/minutes/seconds until the relevant time. At zero they ask for refreshed availability; the countdown must never unlock a paper or override server gates.
- EAT scheduling remains unchanged, regardless of the computer timezone.

## School forms

- Classes and Subjects show their directories first. Add class / Add subject opens a form; Cancel adding closes it. Saving shows the new directory entry. Editing existing entries still works.
- Accounts → Teachers → Add teacher opens the form. Cancel does not create an account. Successful creation still shows one-time credentials; save them privately before closing. No credentials are stored in query caches or browser storage.

## Results charts

- Use the synthetic recovery example, accept its evidence and open Review sitting results, or use a real authorized report after integration.
- Score distribution displays vertical bars with counts and score ranges; the table below contains the same exact values. A report without finalized results shows an empty state.
- Topic bars use percentages from the report and retain earned/available marks, question counts and student counts. Null percentages are unavailable, not a claimed score. Secondary topics and practice never enter official analytics.
- Check the charts at phone widths and enlarged text. Tables may scroll within their container; the whole page should not overflow.

## Reversibility

No deployment or push is part of this change. Review the branch before merging. To undo after merging, revert the design commits on a new branch and test again; do not reset shared history. Reverting the UI must not clear browser storage, pending answers or receipts. The optional review-marker field is backward-compatible with existing local records.

## Verification record

Verified locally on 16 October 2026:

- `npm run check`: typecheck, lint, formatting, 186 Vitest tests and 9 release-source tests passed.
- `npm run e2e`: production build and all 26 browser/axe journeys passed across desktop, 360px phone, landscape and production-shell scenarios. Accessibility audits wait for finite transitions to settle; no rules are disabled.
- After the final refresh-button form safeguard and submitted-list badge, the production build and 7 affected navigation/submission journeys passed again. The full check suite was rerun and passed.
- Inspected the mobile success panel, enlarged-text navigation drawer and results charts visually.
- The baseline lint failure came from already Git-ignored `tmp/` scratch scripts. Frontend lint/format now exclude that scratch directory; application and test coverage remain enabled.

Local demo and intercepted production-shell tests are not real backend acceptance, protected Vercel service-worker verification or capacity testing.
