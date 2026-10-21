# Ethiopian calendar and EAT: architecture and testing

Implemented locally on 21 October 2026. The user chose standard AM/PM clock numbering (9:00 AM EAT stays 9:00 AM), Ethiopian calendar dates, Amharic month names and ordinary 0–9 digits. No Ge'ez numerals or six-hour clock offset is used.

## Kewti sources and integration

Read Kewti's [skill](https://github.com/coderade1905/kewti/blob/8bedfc0f6ece86cb9a70324337318a7fb2e2cb40/.agents/skills/kewti/SKILL.md), [calendar reference](https://github.com/coderade1905/kewti/blob/8bedfc0f6ece86cb9a70324337318a7fb2e2cb40/.agents/skills/kewti/references/calendar.md), [time reference](https://github.com/coderade1905/kewti/blob/8bedfc0f6ece86cb9a70324337318a7fb2e2cb40/.agents/skills/kewti/references/time.md), and [component source](https://github.com/coderade1905/kewti/blob/8bedfc0f6ece86cb9a70324337318a7fb2e2cb40/packages/ui/src/components/kewti-calender/component.tsx). Upstream's README declares MIT. Sources were inspected at commit `8bedfc0f6ece86cb9a70324337318a7fb2e2cb40`.

Kewti uses a copy-and-customize component model. Nexora uses a compact local adaptation of its Ethiopian dropdown pattern at `src/kewti/ui/KewtiDatePickerDropdown.tsx`, backed by the same pinned `kenat@4.0.0` engine. The component retains month/day/year selection and Pagume day clamping, adds Nexora styles and 44px controls, and omits Gregorian switching, holiday artwork and animation dependencies. Its parent provides standard AM/PM selectors and explicit EAT labels. This is a reviewed local adaptation, not an unmodified installation of Kewti's full component bundle. The skill was read from upstream; no global skill or CLI was installed.

## Data flow

1. API timestamps remain UTC ISO strings. Stored records, countdowns and deadlines are not rewritten.
2. `src/lib/ethiopian-date.ts` converts timestamps to EAT civil dates before Ethiopian calendar conversion. It never uses browser-local date getters.
3. The shared `EthiopianDateTimeField` shows Ethiopian day/month/year and standard hour/minute/AM-PM. Days and years are JavaScript numbers, so the UI uses ordinary digits. A preview shows the complete selected date and time.
4. The field returns the existing Gregorian EAT wall-clock string to its caller. `parseEatInput` validates it and applies `+03:00` exactly once to produce the UTC request timestamp. Existing scheduling code and backend contracts remain unchanged.
5. Platform subscription expiry uses the same date control in optional date-only mode. It remains blank until explicitly selected and can be cleared. The existing end-of-day EAT expiry rule is preserved.

For example, `2026-10-17T06:00:00Z` displays as **7 ጥቅምት 2019 ዓ.ም. · 9:00 AM EAT**. It displays identically on a device set to Los Angeles, Tokyo or Addis Ababa.

## Conversion verification and dependency finding

Kenat's forward conversion was checked against the independent `Intl` Ethiopic calendar, including a Gregorian century boundary. Tests exposed a reverse-conversion drift in Kenat 4.0.0: Gregorian 2099-12-11 converted back as 2099-12-10. The adapter now verifies every reverse result by forward conversion and checks at most two neighboring days in either direction. It accepts only an exact Ethiopian year/month/day match, otherwise throws rather than submitting a shifted date. Tests retain this regression and verify known New Year and leap-Pagume boundaries. Kenat limits forward conversion to Gregorian 1900–2100; outside that range the adapter uses the native Intl Ethiopic calendar with Latin digits. Round-trip tests sample four months of every Gregorian year from 1907 through 2108, covering the dropdown’s Ethiopian 1900–2100 range.

Month/year changes clamp a day that no longer exists (Pagume has five or six days). The preview changes immediately, and the scheduling form clears its confirmation. No manual year-offset arithmetic is used. The standard 12 AM/12 PM conversions are tested separately.

## Changed screens

- Exam scheduling and rescheduling: Ethiopian fields, current school time, start/end and extra-time deadline previews.
- Results and practice release: the same Ethiopian date/time controls and EAT previews.
- Platform owner: optional subscription expiry date, school expiry and audit/health timestamps.
- Student exams, preparation, saved-answer timestamps, submission confirmation, results and practice: one shared formatter.
- Monitoring, supervision events, recovery decisions, assistance and school account timestamps: Ethiopian dates and EAT clocks; seconds retained where previously used.
- Refresh timestamps and exam watermark: EAT with AM/PM. Watermark identity remains an attempt reference without student personal details.
- Onboarding and repository instructions describe the calendar and clock convention.

Machine-readable API payloads, audit JSON/CSV timestamps and logs remain UTC for interoperability. The user-facing portal and printable views use the shared display format. No database migration is required for this change; earlier migration 024 validation remains outstanding.

## Manual testing guide

1. Open an approved paper as school admin. Confirm each date field has Day, Amharic Month, Year, Hour, Minute and AM/PM controls. The form must say Ethiopian calendar and EAT.
2. With a test clock before 17 October 2026, select **7 ጥቅምት 2019, 9:00 AM** for preparation (otherwise use a future date). Confirm exam start is **9:10 AM EAT** and the request stores **2026-10-17T06:00:00Z** for preparation. Duration and extra time must still determine the end/deadline normally.
3. Switch the device/browser timezone to America/Los_Angeles or Asia/Tokyo. Reopen the same record: all selected values and displayed EAT times must stay unchanged.
4. Test **6 ጳጉሜ 2015**, then change the year to 2016: the day must become 5. Choose Meskerem 1 and check the New Year boundary. Test 12 AM, 12 PM and 11:59 PM across midnight.
5. Choose a past preparation time or results release before the last student's deadline. Confirmation must stay blocked with a specific error. Refresh school time: entered selections remain. Changing any selection clears schedule confirmation.
6. Schedule and reschedule, then check student preparation, the live monitor, extra-time preview, results and practice release. Each must refer to the same instant. Repeat with a student who has approved extra time.
7. Set and clear an optional subscription expiry. Blank must still mean no expiry, rather than silently selecting today.
8. At 360px portrait and 800×360 landscape, use keyboard selection and inspect all fields for clipping, horizontal scrolling and readable Amharic. Test screen-reader fieldset names and error descriptions.

## Automated verification

`npm run check` passed: TypeScript, ESLint, formatting, 223 frontend tests and 9 release-source tests. Production build passed, retaining existing bundle-size and third-party annotation warnings. Browser suite: 33/35 passed initially; two desktop journeys were interrupted by a development reload while documentation was edited (demo authentication intentionally resets on reload). Both passed unchanged on an isolated rerun: 2/2. All 35 cases therefore have passing results, across desktop, mobile portrait, landscape and production-shell projects. No real backend/database acceptance or physical-device test is claimed. Coverage includes independent calendar comparisons, reverse conversion, Pagume/year changes, ordinary digits, AM/PM boundaries, optional/disabled fields, retained UTC scheduling assertions, stale-time guards and extra-time rules. Browser scheduling/release journeys operate the visible selectors and run with the browser timezone set to America/Los_Angeles.
