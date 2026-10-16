# Frontend readiness follow-up — 15 October 2026

This work improves verification and deployment preparation under F-07/F-09. It does not change API v0.12, the master-plan timing rules, or the decision to keep cleanup disabled. Backend integration and production deployment are not completed by these checks.

## How to use navigation

After signing in, **Workspace navigation** appears on the left at desktop widths (1024 CSS pixels and above) and above the main content on smaller screens. The persistent **Navigation** link in the header returns focus to these links after scrolling. The current page is highlighted. Keyboard users can Tab through links and press Enter, or use **Skip to main content** to bypass them. Login and MFA intentionally have no authenticated workspace menu.

- Students: My exams, Official results, Practice, Register replacement browser. Registration alone does not authorize a device transfer.
- Teachers: My exam papers and Official results.
- Administrators: Exam approvals, Live exams, School setup, Practice release, Recovery review and Official results.

Inside an official exam, **Show question numbers** opens a separate question navigator. A numbered button jumps to that question; a check mark means answered, and the accessible label also announces answered/unanswered. The current number is highlighted. **Hide question numbers** collapses this list without changing answers. Previous/Next still work. This control does not open the workspace menu. Leaving an active exam through a workspace link invokes the existing leave-confirmation flow; it does not submit the exam. Final submission uses Review and submit, then Confirm submission.

## Work and evidence

| Area                     | Work completed locally                                                                                                                                                                               | Evidence still required                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Browser failure paths    | Rejected import followed by valid retry; past preparation and too-early results; production role redirect and session expiry; lost final-response recovery across reload with the identical body/key | Real cookies, database receipts, backend authorization and race behavior    |
| Accessibility            | Keyboard anchor/focus checks, labelled navigation, 200% text resizing, axe checks; wrapping buttons/headings and immediate opacity changes when enabled                                              | Actual screen-reader and complete human keyboard acceptance                 |
| Mobile                   | Isolated 360×800 portrait and 800×360 landscape touch-enabled browser journeys, no page-wide horizontal overflow checks                                                                              | Physical lower-memory Android/browser and real touch/keyboard/network tests |
| Performance/dependencies | Feature pages load on demand; final offline-cache checksums validated by the build; dependency findings reviewed                                                                                     | Actual host/network/phone performance and dependency remediation review     |

Browser-generated keyboard actions and accessibility-tree checks are not a claim of manual assistive-technology testing. No real Android device or screen reader was controlled in this session. Use the procedure below to complete that evidence; do not mark it passed without a tester/device record.

## Physical phone and human accessibility acceptance

Run against an HTTPS staging origin with synthetic accounts; record phone model, RAM, OS/browser version, build ID, API revision, date, tester, outcome and any screenshots without private credentials. Do not use personal/student records. Plain HTTP over a LAN is insufficient for production service-worker/Web Locks acceptance. The local demo can test layout, but resets its server state on reload.

1. In portrait and landscape, sign in as each role. Verify the workspace links, active state and persistent Navigation control. Open every route, scroll long forms/tables, and confirm controls remain readable and tappable without page-wide sideways scrolling. Tables may scroll inside their named region.
2. With an external keyboard, Tab from login through fields and buttons; use Enter to sign in. Use the skip link, workspace links, tabs, radio groups, question numbers, Previous/Next and confirmation controls. Verify visible focus and that focus is never trapped or covered. Repeat at browser zoom 200% and with enlarged OS text. The automated test enlarges text, which is not identical to every browser's zoom implementation.
3. With Android TalkBack (or another recorded screen reader), check page headings, Workspace and Questions landmarks, input names, error messages, expanded/collapsed state, current question, answer state and submission status. Verify the user can distinguish device-save success from a confirmed server receipt. Record actual announced behavior, not just an automated axe result.
4. Prepare and unlock a synthetic paper while online; answer in airplane mode; rotate and navigate among questions. Reconnect and verify the matching receipt. Repeat with offline reload and expired authentication: editing must pause, saved evidence must remain, and the original deadline must not extend. Run the real API acceptance separately; the simulator cannot prove these server outcomes.
5. Try the longest supplied math paper, long question/option text and results tables. Verify CSV download and print preview using the device's actual controls. Record any keyboard covering an input or page action.

## Performance and dependency review

Before this change the production entry JavaScript was 793,594 bytes. After route splitting it is approximately 555 KB (174 KB gzip), about 30% less entry code. Total JavaScript is approximately 806 KB across 24 chunks; splitting does not reduce the complete offline preparation download. The verified shell still caches every emitted route chunk, so lazy loading must not make a prepared offline route depend on a missing file. The postbuild verifier now fails if any shell hash differs from the final emitted asset. This caught and fixed Vite's preload rewrite occurring after the earlier checksum hook.

The >500 KB entry warning remains visible; it has not been suppressed. These are artifact sizes, not measured phone speed, Web Vitals or a 500-student capacity result. Preserve all chunks from each release during deploy/rollback. See deploy.md.

`npm audit --json` on 15 October reported seven high findings through shadcn → registry/ts-morph → fast-glob → micromatch → braces. The reviewed [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no patched version. Its issue is stack exhaustion from deeply nested patterns. This application imports shadcn's CSS during build, not its Node CLI into its browser code; that narrows the observed exposure but does not make the dependency finding disappear. Do not feed untrusted patterns to build/generation tooling. npm's suggested shadcn 1.0.0 downgrade is not a compatible maintenance fix for this 4.x setup and was not applied. No dependency versions were changed. Review a supported upstream fix or separately validated removal of the CLI dependency before release; no clean-audit claim is made.

## Next handoff

Send backend-verification-handoff.md to the backend developer. They must provide staging URL, exact frontend origin, API/migration revision and private synthetic account provisioning, then implement and demonstrate the issued v0.12 contracts. No new endpoint or payload is introduced here. Once available, prioritize the real login → preparation → unlock → save → matching receipt path. Deployment preparation may proceed now, but school production use requires the outstanding integration/device/host evidence.

## Final local verification — 15 October 2026

- `npm run check`: typecheck, lint, formatting and 181 tests across 34 files passed. jsdom has a layout-observer stub; real resize behavior is checked in Playwright.
- Production build and postbuild verification passed; every final shell asset matched its manifest hash. The entry-size and Zod annotation notices remain.
- `$env:E2E_BROWSER_CHANNEL="msedge"; npm exec playwright -- test`: all 26 cases passed in 58.1 seconds with no retries. This used the current production artifact produced by `npm run e2e`; the final rerun followed the test-only observer setup correction. Desktop, portrait and landscape demo journeys plus five production cases are included.
- Automated axe checks passed in the tested states; the 200% text navigation screenshot was visually reviewed, and the header no longer obscures the navigation heading after the anchor jump. This is not screen-reader or physical-phone acceptance.
- `git diff --check` passed. No backend, cloud deployment, cache cleanup, real-phone or screen-reader result is claimed. Subsequent verification confirmed both GitHub check and browser jobs passed for `7da5995` in [run 38867189918](https://github.com/codifex11/Nexora-Online-Examination/actions/runs/38867189918). See deploy.md for the later owner-reported Vercel staging results and unresolved checks.

Unit tests now use at most four workers to avoid compiler/jsdom contention during initial lazy route loading. Assertions and timeouts are unchanged; the complete check suite passed with this setting.
