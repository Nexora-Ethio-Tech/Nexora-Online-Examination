# Spotlight portal tours

## Behavior and architecture

The guide dims the surrounding page and highlights the actual navigation link or owner control. Its popup chooses free space beside, above or below that target and scrolls internally when vertical space is limited. It never clicks a target or navigates automatically. Users select the highlighted control themselves. Previous tip, Next tip, Close guide and reopening preserve the existing account-scoped progress behavior.

On small screens, the closed Navigation button is highlighted first. After the user opens the menu, the guide highlights the actual navigation link. Its portal moves inside the modal navigation element to preserve the menu's focus handling. The navigation sheet uses no translation animation so fixed overlay coordinates remain viewport-relative. Missing targets produce an explicit message instead of highlighting an unrelated heading. Active exam runners still exclude onboarding.

The shared placement helper chooses non-overlapping viewport space. Scroll, resize and DOM changes trigger placement updates. A clipped translucent overlay leaves a hole around the target, with pointer events disabled so navigation remains usable. Owner steps point to section headings or the Add school button instead of entire large sections. Guidance text remains in the role manifest; change it whenever workflows change so the content revision reoffers updated guidance.

## Test with local school or owner accounts

1. Open Portal guide (Owner guide for the platform owner). Expect a clear target surrounded by a dimmed page, with the text box beside it.
2. Move through tips. Confirm the target and box move together, and the guide never opens a page or presses a button for you.
3. Select the highlighted link yourself. The tip should remain available after navigation. Close and reopen the guide; it should resume at the current tip.
4. At a 360-pixel phone width, open the highlighted Navigation button. Verify the actual menu link becomes highlighted and is clickable. Use Next tip and Close guide while the menu is open.
5. Repeat after scrolling, resizing and in landscape. The target must remain uncovered; scroll inside a short popup to reach its buttons.
6. Finish the guide, reload, and reopen it deliberately. Confirm onboarding is absent from an active student exam runner.

## Automated evidence

Geometry tests check non-overlap and viewport bounds at desktop, phone and landscape sizes. Browser tests check actual popup/target rectangles, mobile menu navigation, manual link selection, retained tips and accessibility. Component tests cover account isolation, dismissal, reopening, content updates and blocked local storage.

## Speech-bubble appearance

The guide uses a 32-pixel radius on all four corners, a soft shadow and a broad asymmetric speech-bubble horn. The 32-pixel-wide pointer base stays beyond the rounded corners; its tip points to the middle of the facing edge of the highlighted control and stops four pixels outside it. A 32-pixel layout gap gives the curve room without covering the control. Placement uses the measured content height and centers the bubble near the target, including targets near viewport edges. The outer bubble clips its contents; an inner container scrolls so all four corners stay rounded in short viewports. Very small bubbles omit the tail instead of drawing across a corner. The decorative SVG ignores pointer events. Missing targets hide the pointer. School and owner guides share the presentation revision.

## Control anchors (24 October 2026)

School guide steps may provide an ordered list of stable `data-tour` selectors. The resolver prefers a visible control: New exam, the question file input or Questions tab, bulk review or Review questions tab, Submit for approval, school Classes and Roster import tabs, Pending approval, the assistance sitting selector, authenticator setup and Download exam or Current exams. It falls back to the corresponding navigation link when the control is unavailable, with text explaining that the user should open that page. On phones, a closed Navigation button is the final navigation fallback. An open navigation sheet owns target selection, so the pointer never selects a control behind the modal. Hidden and inert controls are excluded. Broader overview tips retain their navigation targets; the guide still does not run over an active student exam.

The target and bubble are observed for size changes; page mutations, scrolling and window resizing reposition the guide. Newly highlighted controls scroll into the center of their scroll area, and new tips reset their internal scroll position to the heading. A tab change can move the pointer from its tab to the newly visible control without advancing the tip. Nothing is clicked or submitted automatically. No API or exam-engine changes are involved.

Verification for this revision includes target-priority/hidden-control/menu tests, four-direction tail geometry, viewport-edge positioning and browser journeys through school navigation and teacher authoring at desktop, phone and landscape sizes. Browser screenshots are saved under the test runner's output directory.

### Validation on 24 October 2026

- TypeScript, ESLint and formatting passed. All 284 frontend tests and 17 tooling tests passed.
- The standard production build passed. Existing dependency annotation and bundle-size warnings remain.
- Sandbox runs initially failed when esbuild could not read the configuration directory. With explicit permission, the unchanged build and test commands succeeded outside the sandbox.
- All six targeted Playwright journeys passed: administrator navigation and teacher control retargeting at 1366×900, 360×800 and 800×360. These check rounded corners, non-overlap, visible curved tails, manual navigation, pause/resume, tab changes and accessibility. The teacher test creates its own draft rather than assuming demo data exists.
- Desktop, phone and landscape screenshots were visually inspected. These are Chromium demo UI checks; they do not establish real-device or backend acceptance. This feature changes no API, database or exam-security behavior.

Check all four rounded corners, including while the text scrolls. Browser checks assert each corner is 32 pixels. Check the tail after Next tip, scrolling, resizing and opening mobile Navigation. It must face the highlighted control, never cover it, and remain visible when the text box scrolls. Desktop, 360-pixel phone and landscape browser journeys verify the bubble remains separate from its target; screenshots support visual review.
