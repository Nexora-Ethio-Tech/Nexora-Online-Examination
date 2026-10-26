# Clear portal language: architecture and testing

Implemented locally on 21 October 2026. This change replaces technical screen wording with instructions for students, teachers and school administrators.

## Architecture and scope

This is a presentation change. API field names, database values, encryption, download checks, answer persistence, submission confirmation, permissions and timing rules remain unchanged. The runner engine has message-string edits only. The typed `authoring/import-status.ts` map translates every import state into a readable label without changing worker behavior.

| Area                | Previous wording                        | New wording and purpose                                                                                             |
| ------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Student preparation | Download encrypted paper                | Download exam: tells the student what to do                                                                         |
| Download checking   | Verify the paper checksum               | Check that the download is complete                                                                                 |
| Preparation success | Ready for the common start              | Ready for your exam, with instructions to keep the tab open and stay connected until starting                       |
| Demo preparation    | Checksum and development-server details | Exam saved for this demo, with an explicit warning that offline access is not checked and readiness is not reported |
| Saved answers       | Last server save                        | Last answers received by your school; device saves remain separately visible                                        |
| Submission pending  | Pending upload / matching receipt       | Waiting to send your answers / submission confirmation; no success claim before confirmation                        |
| Paused exam         | Revalidate and reopen                   | Try opening exam again; assistance instructions use the same button name                                            |
| Teacher uploads     | queued / parsing / ai_queued            | Waiting to read your file / Reading questions from your file / Waiting for AI suggestions                           |
| Account management  | Credentials                             | Login details, retaining the warning that passwords cannot be shown again                                           |
| Live monitoring     | Server snapshot / unsynced device work  | Last updated / answers saved only on the student's device are not shown                                             |
| Recovery review     | Accept this snapshot                    | Accept these saved answers; technical reference details remain available for investigations                         |
| Onboarding          | Encryption and server-save terminology  | Guidance aligned with the new labels                                                                                |

Student IDs, confirmation numbers and admin investigation details remain where useful. Author-supplied exam instructions, uploaded content, and provider-supplied diagnostic messages are not rewritten by this change. The platform-owner operations console remains a technical administration surface.

## Wording rules for future work

- Say what happened and what the person should do next.
- Use “exam”, “saved answers”, “login details”, “school” and “submission confirmation” in ordinary tasks.
- Never equate saved on this device with received by the school, or waiting for review with submitted.
- Never say an exam is ready before download, storage and required checks succeed.
- Keep error recovery specific; do not instruct students to clear data containing unsent answers.
- Keep demo limitations visible in plain language. Keep detailed references in staff investigation areas.
- Update onboarding when labels or actions change, and keep accessible button names and tests aligned.

## Manual acceptance

1. Student: open a scheduled exam. Confirm download instructions say when to return, and do not suggest the exam has started.
2. Download in demo mode. Confirm “Download exam”, readable progress steps and “Exam saved for this demo”. Confirm the warning says offline access is not checked and the school has not received readiness.
3. Simulate a corrupt download with the existing test transport. Confirm the failed step is shown, success stays hidden, and retry succeeds.
4. Start an exam, answer a question, then disconnect. Confirm saved-on-device and waiting-to-send information remain distinct. Submit offline: it must not show “Submitted successfully”. Reconnect and verify confirmation.
5. Request help or reopen an exam after interruption. Confirm both the button and instructions say “Try opening exam again”; the original deadline remains.
6. Teacher: upload a supported example. Check readable waiting/reading/AI/review states, question counts and the existing cancel/retry actions.
7. Admin: create student login details, download the private list, and close it only after acknowledging it was saved. Retry an already completed issue request: no new passwords should be created.
8. Admin: refresh live monitoring with the connection disabled. Confirm the out-of-date warning remains and device replacement stays disabled. Review saved answers and verify technical references remain available.
9. Repeat at 360px portrait and 800×360 landscape with keyboard navigation and the onboarding guide.

## Verification

Existing integrity, offline submission, permissions and stale-monitor assertions remain in place; only expected visible wording is updated. No migration or backend change is required for this wording change. Earlier migration 024 acceptance remains a separate deployment prerequisite.

- `npm run check` passed: TypeScript, lint, formatting, 216 frontend tests and 9 release-source checks.
- `npm run build` passed. The existing large-bundle advisory remains.
- Full Playwright run: 32 passed; three viewport variants initially failed because one assertion still expected the old demo-readiness sentence. That assertion was updated to the equivalent plain-language warning; all three passed on the targeted rerun. All 35 cases therefore have passing evidence, including accessibility, offline answers, confirmed submission, production reload, teacher imports and admin reviews.
- `git diff --check` passed. No live database, AI-provider or production deployment validation was performed for this presentation-only change.

## 26 October 2026 — compact forms and connection feedback

See [compact portal forms and lists](compact-portal-forms-and-lists.md) for the shared connection banner, red required markers, compact filters, cached pagination and contextual edit dialogs. Background connectivity errors are consolidated at the top; failed explicit actions and exam-save/submission distinctions remain visible. Reviewed roster saves now create the login details and show one private download; Accounts is the optional editing/reset path. Onboarding follows these changes. This roster change requires the matching backend source, unlike the earlier wording-only changes.
