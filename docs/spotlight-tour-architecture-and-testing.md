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

The guide uses a 32-pixel radius on all four corners, softer shadow and a curved speech-bubble pointer. The pointer faces the nearest edge of the highlighted control and stops four pixels outside it. The pointer base stays at least 38 pixels from each corner, beyond the 32-pixel curve. The outer bubble clips its contents; a separate inner container scrolls so all four corners stay rounded even in a short viewport. Very small bubbles omit the tail instead of drawing across a corner. A 20-pixel layout gap gives the tail room without covering the target. The SVG is decorative and ignores pointer events; it sits outside the scrolling text box so the tail stays visible. Missing targets hide the pointer. The same presentation is used for school and owner guides, with updated presentation revisions.

Check all four rounded corners, including while the text scrolls. Browser checks assert each corner is 32 pixels. Check the tail after Next tip, scrolling, resizing and opening mobile Navigation. It must face the highlighted control, never cover it, and remain visible when the text box scrolls. Desktop, 360-pixel phone and landscape browser journeys verify the bubble remains separate from its target; screenshots support visual review.
