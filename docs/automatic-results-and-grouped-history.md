# Scheduled results, grouped device history, and zero preparation

## What changed

- Device history now has four expandable groups: window/tab changes, screen protection, watermark integrity, and returns to the exam. Each shows a count and latest received time. Expand to inspect the original records. Advanced incident analysis remains available separately. These events are observations, not proof of cheating.
- Results become available at the scheduled release time without another administrator approval. School admins can edit that time in Official results only before the existing release time arrives. The server enforces this cutoff, including concurrent requests.
- Preparation accepts 0–120 whole minutes and defaults to 10. Zero opens download access at the exam start; it does not make downloads instantaneous or give late arrivals extra time.

## Architecture

Migration `027_automatic_result_release.sql` permits an explicitly automatic publication with no human approver. Historical publications are retained; existing planned dates are reconciled with their publication dates.

Authorized current-result reads materialize due publications inside tenant transactions. Session row locks serialize release with result changes and release-date edits. This request-driven design works on Vercel without an always-running timer. It makes results available when the portal requests them after the deadline; it does not send email, SMS, or a background notification. The student results page polls every 15 seconds while active.

Release also waits until all submission acceptance windows close. Pending uploads and recovery cases remain pending with null marks/ranks. Accepted corrections automatically produce a newer published revision after the release date; older snapshots remain immutable. Practice remains separately enabled and cannot open before the current scheduled result date.

The new admin-only POST `/sessions/:id/results-release-schedule` takes `expectedReleaseAt` and `releaseAt` plus an idempotency key. It checks school ownership, locks the session, checks server time, rejects stale dates and dates before acceptance closes, records an audit event, and advances the result revision. Already released results cannot be hidden again. The older publication endpoint remains for compatibility; it is no longer part of the routine UI.

Preparation validation is shared across frontend and backend. UTC timestamps remain authoritative; controls display Ethiopian/Gregorian dates and EAT.

## Test in this order

Use the isolated local test database and local test accounts, never production credentials or the production database.

1. **Apply migration 027 to a disposable database first.** Run the existing local integration command from `exam-frontend`: `node scripts/local-test.ts test`. Confirm the migration ledger and nullable system approver checks pass. Do not deploy until this succeeds. Earlier unvalidated migrations also remain deployment gates.
2. **Preparation:** as school admin, schedule an approved exam. Confirm default 10; choose 0 and verify download opening and start match. Check -1, 121 and fractional values are rejected. Test a normal positive duration too.
3. **History:** open a monitored student's device history. Generate focus/visibility/fullscreen events in a test exam. Confirm four useful groups, counts and newest time; expand each and confirm original timestamps are retained. Test keyboard and narrow-screen access.
4. **Before release:** complete a test exam and open student Official results before the scheduled time. No marks or ranks should be exposed. As admin, change the release time to another valid future time. Refresh and confirm it persists.
5. **Automatic release:** keep the student results page open through the scheduled time, or reopen afterward. Results should appear on the next refresh without clicking an approval button. If an extra-time submission window is still open, results must wait.
6. **Cutoff:** at or after the existing release time, confirm the date editor is locked. A direct API request must also fail. Try two admin tabs editing the same old date: the second stale request must conflict. Teachers and another school's admins must be denied.
7. **Recovery:** leave one attempt awaiting recovery. At release it must show pending, not zero or a rank. Accept the retained upload; verify the new score becomes visible automatically and the prior report revision is unchanged.
8. **Practice:** postpone results before release and verify practice remains unavailable until the new release date, even if a prior publication exists. Practice still requires its own enablement and all related sitting windows to close.
9. **History integrity:** repeat result reads and simultaneous reads; verify only one automatic publication per result revision and an audit record. Verify historical CSV/report snapshots remain unchanged.

## Verification record

See the final chat report for exact automated check totals. Unit/demo checks do not establish real database concurrency, tenant isolation, or production readiness. Migration 027 and the database integration suite must pass in a disposable PostgreSQL database before deployment.

Checks run on 23 October 2026:

- Frontend typecheck, lint and formatting passed; 265 frontend tests and 14 tooling checks passed. The accessible preparation-label correction was followed by all 5 preparation-form tests passing.
- Backend build and all 205 unit tests passed.
- Disposable database integration was attempted: connection refused at `127.0.0.1:55432`; 22 cases could not run. Migration 027 has not been applied or validated here.
- Initial browser failures exposed the preparation input's combined accessible name and outdated test timing/layout assumptions. The label was corrected; browser tests now initialize the clock before application startup and measure spacing after the explanatory hint.
- Final frontend production build passed (existing large-chunk and dependency annotation warnings remain).
- All nine targeted desktop/mobile/landscape journeys passed across the final run and an isolated rerun. The combined run passed eight and lost the demo session during landscape navigation while a build was running; the unchanged landscape journey passed alone afterward. These are synthetic browser checks with accessibility assertions, not real backend acceptance.
- Ten local commits were created for this task. No push or production database operation was performed.
