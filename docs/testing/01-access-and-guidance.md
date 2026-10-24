# 1. Login, guidance, layout and language

[Testing home](README.md) · Next: [School and accounts](02-school-and-accounts.md)

Use the real local site and separate browser profiles for each role. Mark each numbered check in the [test record](TEST-RECORD.md).

1. **Sign in and out.** Sign in using each private test account. Expect its own portal: student exams, teacher papers, school administration, limited invigilator assistance, or the separate owner portal. Refresh and confirm the session remains valid. Sign out; protected pages must require login again. Try a wrong password: expect a clear error, not access.
2. **MFA.** Administrator and owner access must follow their MFA flow. Use the account's own Authenticator entry. Wrong or reused codes must fail where a fresh code is required. Teacher/invigilator first enrollment is tested in step 4; do not share a staff factor with students. Lost factors need the protected recovery process, not a student workaround.
3. **Reopen the tour.** Select Portal guide, or Owner guide. Expect rounded corners on all four sides and a curved tail pointing to the highlighted control. The surrounding page is dimmed; the target remains clear and clickable. The bubble must not cover it.
4. **Follow controls.** Use Next tip and Previous tip. Open the highlighted page yourself. Expect the guide to point to the relevant visible control, or its navigation link if the control is not yet available. Changing a tab can reveal a more precise target. The guide must not click, submit or navigate automatically.
5. **Pause/resume.** Close the guide, explore, reopen and reload. Expect the saved tip to remain resumable for that account/browser. A completed guide can be opened again. Different accounts must not inherit each other's progress. Updated guide content may reoffer guidance; browser preference storage is optional, not an access requirement.
6. **Small screens.** Repeat at 360-pixel width and landscape. Open mobile Navigation while the tour is active. Expect the menu link to become the target; the tip stays usable inside that menu. Scroll a long tip and advance: the next tip should start at its heading. Buttons and focused fields remain reachable.
7. **Keyboard and reading.** Use Tab, Shift+Tab and Enter on ordinary forms, tabs and guide buttons. Expect visible focus, readable labels, actionable errors, no overlapping text, and no unexpected horizontal page scrolling. Keep longer table-specific scrolling separate from broken page layout.
8. **Language.** Check student-facing downloads and error messages. Expect ordinary language, not internal encryption/worker/debug details. Amharic months and question text must render correctly; day numbers use 1, 2, 3 rather than Ge'ez numerals. Times use standard AM/PM with EAT.
9. **Exam exclusion.** Enter an active student exam during step 5. No onboarding popup may appear above the exam or its security overlay.

Details: [Speech-bubble architecture/testing](../spotlight-tour-architecture-and-testing.md), [portal language](../portal-language-architecture-and-testing.md), [resumable guides](../resumable-guides-and-owner-portal.md), [Amharic/fonts](../chat-change-guides/04-amharic-and-fonts.md).
