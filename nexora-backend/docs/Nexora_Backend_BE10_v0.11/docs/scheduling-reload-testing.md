# Scheduling guidance and offline-reload recovery

15 October 2026. Frontend audit F-03/F-04 implementation. API contract remains v0.10. Read the companion [backend verification note](backend-scheduling-reload-verification.md) for mandatory integrated evidence. This change does not implement accommodation configuration, readiness acknowledgement or real backend services.

## Scheduling: what changed

The form displays current EAT from the API's serverNow sample plus monotonic browser elapsed time. It never interprets input in the computer's timezone. The clock is explicitly an estimate: the API remains authoritative. Dates are still sent as UTC ISO timestamps.

The preparation and results fields now have separate, accessible validation messages. Preparation must be in the future. Planned results must be at or after the calculated common end; the server additionally validates all accommodated deadlines. Preparation still lasts exactly ten minutes. Planned results do not publish marks or enable practice.

A sample becomes stale after 60 seconds. Confirm is paused until Refresh server time obtains a fresh response. Refresh preserves edited dates and clears the review confirmation. A reschedule stops being available at the original preparation boundary, even if the proposed new date is later. The API must independently enforce that boundary and concurrency rules.

### Manual scheduling checks

1. Run `npm run dev:demo`, sign in as teacher, upload a bundled example unchanged, review/save all questions and submit. Sign out in the same tab; sign in as admin and approve it. Public demo credentials are in README.md. Wait for the package to be ready.
2. In Schedule a class sitting, read Current EAT time. If your computer uses Pacific time, use the displayed EAT value, not the Windows clock. Choose preparation several minutes ahead. Verify common start is ten minutes later and common end adds the paper's duration. Test a date crossing midnight as well.
3. Enter a past preparation time. Expect the preparation-field message. Enter results before common end. Expect the results-field message. Confirming invalid values must not create a sitting.
4. Correct both dates. Changing either clears the confirmation checkbox. Check it and confirm; expect the persisted schedule. Result publication and practice remain separate actions.
5. On an unsaved form, keep entered dates and wait at least 60 seconds. Expect Server time needs refreshing and disabled confirmation. Refresh server time: entered values remain; check the confirmation again only after reviewing the fresh clock. If the refresh fails, retain the form, fix connectivity and retry; do not assume the last snapshot is fresh.
6. Open Change schedule before preparation. At the original preparation boundary the form must refuse further edits being submitted. Verify this with a controlled test clock on staging, not a production clock override. The API must reject stale edits even if a browser bypasses the form.

## Offline reload and sign-in: what changed

An attempt URL that cannot restore its session now displays Reconnect to recover your exam, explains that editing is paused, warns against clearing site storage and offers Try again. It does not inspect or reveal private answers while unauthenticated, and does not claim that every answer was saved.

When an authenticated student visits an attempt, the app retains only that tab's attempt path and school/user identifiers in sessionStorage. This is a navigation hint, not authentication, an answer store or a source of deadlines. After expired-session login, the same school/student returns to the attempt. A different identity goes to its own workspace. Invalid/external hints are rejected. Ordinary navigation away from the attempt clears the hint. If sessionStorage is blocked or the tab is lost, navigate through My exams after signing in; IndexedDB evidence is not deleted by losing the hint.

The existing runner then reads that student's retained evidence and revalidates the server state, time and active device. A final payload retains its original idempotency key. Expiry does not reset a deadline, and a closed attempt is not assumed submitted without a matching receipt.

### Real-backend recovery checks

Use a production build served over HTTPS (localhost is acceptable for local browser verification), with mocks disabled and a functioning API. The application shell must have been successfully prepared before testing offline reload. Vite development mode and the reset-on-reload in-memory demo cannot establish this acceptance.

1. Prepare and unlock a real synthetic student attempt. Answer several questions and wait for Saved on this device. Record the attempt/deadline. Disconnect and answer another question in the open tab; verify local saving continues.
2. Reload while offline. Expect the cached shell and recovery guidance; no editable questions, visible answer values or fabricated submission. Keep site storage intact.
3. Reconnect and select Try again. With a valid same-student session, expect the original attempt to revalidate and recover saved selections if editing is still allowed. Verify deadline and active generation are unchanged.
4. Repeat with an expired session. Reconnect, retry and sign in as the same student. Expect return to the original attempt, then server validation. Repeat with a different student/school: expect that user's own workspace, no old answers and no automatic access to the retained attempt.
5. Repeat with a pending final submission whose response was lost. Reauthentication must retain the exact frozen body/key and recover the same committed receipt. If the server never accepted it and the deadline has passed, retain evidence for recovery review; never show a fake Submitted status.
6. Repeat with an already submitted attempt, replaced device and rejected/accepted recovery cases. Verify server-authorized state and evidence preservation. Check a real Android device, low connectivity and 360px layout.

## Evidence and limits

Automated tests cover EAT midnight conversion independent of the device clock, field errors, confirmation reset, stale samples, refresh preserving values, original reschedule cutoff, cold unauthenticated recovery, same-user login return, different-user/school protection, invalid redirect rejection and frozen IndexedDB final-payload preservation. Existing runner tests additionally cover revalidation, offline restoration refusal, session expiry, receipt mismatch and lost-response retries.

Local headless Edge checked the production scheduling form at 360x800 in America/Los_Angeles with a synthetic API response. The real built service worker was installed in an isolated test browser; after disabling networking, the cached production app reloaded at an attempt URL and showed recovery guidance without answers. No horizontal overflow occurred. Screenshots are under ignored `tmp/`. This proves the shell/guidance behavior, not an end-to-end real API/database recovery. Actual cookies, Android hardware, integrated receipts and host acceptance remain outstanding.

Verification completed: `npm run check` passed type checking, lint, formatting and all 167 tests across 31 files. `npm run build` and `git diff --check` passed. Existing Zod annotation and large-chunk build warnings remain. No dependency was added and no backend payload changed. A replayed mutation response is deliberately treated as a stale clock until a fresh detail GET completes, because an idempotent replay may carry its original serverNow.
